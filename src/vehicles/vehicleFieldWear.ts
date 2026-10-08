// src/vehicles/vehicleFieldWear.ts — the vehicle field wear: dust and wet earth thrown up off the running gear in the
// battlefield's own soil, graded by height, gathering on the decks and ledges and broken by noise.
//
// Round 5 redesign (2026-10-08, tank-accessories lane). Rounds 2-4's field wear scored flat in two blind close-up
// waves (240 and 264; materials.ts history at 95afc36d6): "a gravity-blind overlay (cream sawtooth dust stencilled
// along the skirts ..., ink-blot or pepper specks on the M60, flat tan tints, airbrushed smudges)", "pale cream is the
// wrong tone on green farmland (there: darker, wetter earth with splash patterns)", "tan-on-tan erases the form in the
// desert", while at battle distance (wave 265) its dirt concentrated low on the running gear helped. This layer keeps
// that read and rebuilds the look:
// - the coat's colours come from the battlefield (VEHICLE_FIELD_GROUNDS, set with the map's AUTO camouflage in
//   materials.ts setCamoBiome): dark wet earth on the farmland, pale dust with value contrast in the deserts, packed
//   snow and slush in winter; the Garage shows a light neutral film;
// - the coat is a broad gradient up from the ground contact (never a stencilled band): heavy on the tracks, wheels and
//   lower skirts, thinning to nothing by about 1.3 m, its top line wandering with a low noise octave, turning into
//   clumps and spatter where the fine octave resolves (close-ups) and into its plain average where it does not (range:
//   large-scale value first, no sparkle);
// - gravity-aware: faces turned down toward the tracks catch the most splash, vertical faces shed it, and the dry film
//   settles only on faces that look up (decks, fenders, roofs), thinner up the turret;
// - priced for the 14 v 14 frame: no texture, sampler, define or program key; four vec4 uniforms (three per battle, one
//   per draw), a vec3 varying, one 2D value-noise octave everywhere the coat or film can show and a second only up
//   close, and a branch that skips the high vertical faces where neither reaches.
// The per-material role (how much coat and film a surface takes) rides the per-draw ground reference
// (tankFactoryCore.ts installVehicleGroundReference → materials.ts setVehicleGroundFromRoot), so every vehicle
// material — profile clones and decor included — reads it without a variant of its own.

import * as THREE from 'three';

/** Field-wear strength on the Garage showroom build (a light neutral film); battle builds wear 1. */
export const VEHICLE_FIELD_WEAR_GARAGE = 0.42;

type Rgb = readonly [number, number, number];

/** One battlefield's soil on the vehicle, in linear RGB. */
export interface VehicleFieldSoil {
  /** The packed coat on the running gear and the lowest plates (wet earth, oily dust grime, packed snow). */
  readonly deep: Rgb;
  /** How wet (glossy) the deep coat is, 0..1. */
  readonly wet: number;
  /** The coat higher up, thinning with height (drying mud, dust, slush). */
  readonly splash: Rgb;
  /** How much spatter flies above the coat line, 0..1. */
  readonly spatter: number;
  /** The dry film that settles on faces looking up. */
  readonly settle: Rgb;
  /** How much of it settles, 0..1. */
  readonly settleAmount: number;
}

type FieldClimate = 'vegetated' | 'arid' | 'snow';
/** A battlefield's ground as its terrain renders it (linear): the dirt layer drawn as soil and the ground cover. */
interface FieldGround {
  /** The terrain's dirt layer as soil: its measured linear mean times the map's soil tint (terrain.ts uMeanD x uSoilTint). */
  readonly dirt: Rgb;
  /** The terrain's base layer: grass, sand or snow (terrain.ts uMeanG). */
  readonly ground: Rgb;
  readonly climate: FieldClimate;
  /** How wet the ground runs, 0..1 (coasts, deltas and still water wettest; arid 0). */
  readonly wet: number;
}

const ground = (dirt: Rgb, base: Rgb, climate: FieldClimate, wet: number): FieldGround =>
  Object.freeze({ dirt, ground: base, climate, wet });

/**
 * Every battlefield's ground (the AUTO camouflage's map ids, materials.ts setCamoBiome; an unknown id reads as Verdant).
 * The colours are the terrain's own: each map's sourced palette composed as sourcedTextures.ts composes it (photo x AO x
 * the plan's tint and the map's sourcedTint, desaturated and lifted) and measured as terrain.ts measures its layer means
 * (the linear mean per channel), the dirt under the map's splat.soilTint; the climate is the map's groundRedux.ts class.
 * vehicleFieldWear.selftest.mjs recomputes them from the photos and the plan and holds this table to them, so a ground
 * retint fails there until the vehicles follow it.
 */
export const VEHICLE_FIELD_GROUNDS: Readonly<Record<string, FieldGround>> = Object.freeze({
  verdant: ground([0.027, 0.019, 0.013], [0.061, 0.086, 0.016], 'vegetated', 0.75),
  desert: ground([0.355, 0.244, 0.117], [0.439, 0.321, 0.167], 'arid', 0),
  winter: ground([0.087, 0.053, 0.028], [0.676, 0.789, 0.892], 'snow', 0.45),
  urban: ground([0.097, 0.059, 0.03], [0.07, 0.088, 0.019], 'vegetated', 0.4),
  coastal: ground([0.484, 0.343, 0.158], [0.067, 0.088, 0.014], 'vegetated', 0.8),
  autumn: ground([0.113, 0.061, 0.026], [0.126, 0.114, 0.012], 'vegetated', 0.8),
  steppe: ground([0.113, 0.061, 0.021], [0.163, 0.124, 0.042], 'vegetated', 0.25),
  railyard: ground([0.05, 0.039, 0.029], [0.053, 0.063, 0.011], 'vegetated', 0.35),
  frontier: ground([0.075, 0.046, 0.025], [0.076, 0.092, 0.014], 'vegetated', 0.4),
  fjord: ground([0.073, 0.049, 0.025], [0.048, 0.077, 0.016], 'vegetated', 0.8),
  delta: ground([0.071, 0.035, 0.011], [0.038, 0.092, 0.01], 'vegetated', 0.9),
  badlands: ground([0.265, 0.088, 0.035], [0.461, 0.2, 0.072], 'arid', 0),
  monsoon: ground([0.055, 0.031, 0.012], [0.028, 0.07, 0.009], 'vegetated', 0.9),
  alpine: ground([0.078, 0.049, 0.027], [0.676, 0.789, 0.892], 'snow', 0.45),
  caldera: ground([0.025, 0.018, 0.013], [0.061, 0.081, 0.011], 'vegetated', 0.55),
  foundry: ground([0.043, 0.027, 0.014], [0.036, 0.044, 0.009], 'vegetated', 0.35),
  ruinspires: ground([0.104, 0.084, 0.065], [0.091, 0.099, 0.049], 'vegetated', 0.3),
  blackglass: ground([0.069, 0.059, 0.05], [0.053, 0.066, 0.039], 'vegetated', 0.5),
  titan_gorge: ground([0.336, 0.153, 0.056], [0.509, 0.285, 0.117], 'arid', 0),
  skybridge: ground([0.233, 0.096, 0.037], [0.417, 0.188, 0.066], 'arid', 0),
  polders: ground([0.026, 0.019, 0.015], [0.061, 0.086, 0.016], 'vegetated', 0.85),
  copper_mesa: ground([0.224, 0.175, 0.154], [0.302, 0.24, 0.208], 'arid', 0),
  airfield: ground([0.05, 0.039, 0.029], [0.053, 0.063, 0.011], 'vegetated', 0.4),
  oasis: ground([0.355, 0.244, 0.117], [0.439, 0.321, 0.167], 'arid', 0.1),
  whiteout: ground([0.087, 0.053, 0.028], [0.507, 0.6, 0.694], 'snow', 0.35),
  orchard: ground([0.026, 0.019, 0.015], [0.061, 0.086, 0.016], 'vegetated', 0.6),
  longleaf: ground([0.026, 0.019, 0.015], [0.061, 0.086, 0.016], 'vegetated', 0.45),
  mangrove: ground([0.055, 0.031, 0.012], [0.028, 0.07, 0.009], 'vegetated', 0.95),
  saltwind: ground([0.179, 0.072, 0.035], [0.089, 0.079, 0.024], 'vegetated', 0.75),
  reservoir: ground([0.075, 0.046, 0.025], [0.076, 0.092, 0.014], 'vegetated', 0.75),
  mars: ground([0.265, 0.088, 0.035], [0.461, 0.2, 0.072], 'arid', 0),
  moon: ground([0.055, 0.055, 0.055], [0.078, 0.078, 0.078], 'arid', 0),
  cliffbridge: ground([0.127, 0.11, 0.087], [0.115, 0.088, 0.027], 'vegetated', 0.3),
});

const lum = (c: Rgb): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const scale = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];
const lift = (c: Rgb, k: number): Rgb => [c[0] + k, c[1] + k, c[2] + k];
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const desat = (c: Rgb, k: number): Rgb => mixRgb(c, [lum(c), lum(c), lum(c)], k);
/** The colour with its luminance held inside [lo, hi] (hue and saturation kept). */
const toLuma = (c: Rgb, lo: number, hi: number): Rgb => {
  const l = lum(c);
  return scale(c, Math.min(hi, Math.max(lo, l)) / Math.max(l, 1e-4));
};

/**
 * The vehicle's soil from its battlefield's ground. Farmland and meadow: the soil itself, darkened wet low on the
 * running gear (held to a readable 0.06-0.14 luminance and greyed: wave 265 wants "darker, wetter earth", not a black
 * void; on the dark tyres and track it reads lighter than the rubber), drying to a mid grey-brown up the hull (0.1 and
 * up, still far darker than round 4's cream), and its fine dust (a grey-brown two to three times the soil's value) on
 * the decks.
 * Arid: the dust is the ground's own sand ground finer, so paler and greyer than both the sand and a tan paint (wave
 * 265: "tan-on-tan erases the form ... dust there needs VALUE contrast"), over an oily grime packed on the running gear
 * at about half the sand's value, so the tracks and wheels stay the darkest band under the pale hull. Snow: packed snow
 * and dirt in the running gear, dark slush thrown up the hull, fresh snow on the decks.
 */
export function deriveVehicleFieldSoil({ dirt, ground: base, climate, wet }: FieldGround): VehicleFieldSoil {
  if (climate === 'arid') {
    const settle = desat(lift(scale(base, 1.15), 0.08), 0.4);
    return Object.freeze({
      deep: desat(scale(dirt, 0.55), 0.3), wet: Math.min(wet, 0.2),
      splash: scale(settle, 0.93), spatter: 0.35,
      settle, settleAmount: 0.9,
    });
  }
  if (climate === 'snow') {
    return Object.freeze({
      deep: mixRgb(base, dirt, 0.45), wet,
      splash: scale(desat(dirt, 0.45), 1.1), spatter: 0.8,
      settle: scale(base, 0.96), settleAmount: 0.75,
    });
  }
  const dust = desat(scale(dirt, 2.6), 0.3);
  return Object.freeze({
    deep: desat(scale(toLuma(dirt, 0.06, 0.14), 0.9), 0.25), wet,
    splash: desat(toLuma(scale(dirt, 2.2), 0.1, 0.3), 0.3), spatter: 0.55 + 0.35 * wet,
    settle: toLuma(dust, 0.12, 0.4), settleAmount: 0.8 - 0.25 * wet,
  });
}

const SOILS = new Map<string, VehicleFieldSoil>();
/** The vehicle soil a battlefield id resolves to (an unknown id reads as Verdant). */
export function vehicleFieldSoil(mapId: string | null | undefined): VehicleFieldSoil {
  const id = mapId && Object.prototype.hasOwnProperty.call(VEHICLE_FIELD_GROUNDS, mapId) ? mapId : 'verdant';
  let soil = SOILS.get(id);
  if (!soil) {
    soil = deriveVehicleFieldSoil(VEHICLE_FIELD_GROUNDS[id]);
    SOILS.set(id, soil);
  }
  return soil;
}

/** The Garage's light neutral film (no battlefield yet: the showroom shows the vehicle, not a map). */
const GARAGE_SOIL: VehicleFieldSoil = Object.freeze({
  deep: [0.15, 0.135, 0.115] as Rgb, wet: 0, splash: [0.22, 0.2, 0.17] as Rgb, spatter: 0.25,
  settle: [0.25, 0.23, 0.2] as Rgb, settleAmount: 0.6,
});

const BATTLE = { deep: new THREE.Vector4(), splash: new THREE.Vector4(), settle: new THREE.Vector4() };
const GARAGE = { deep: new THREE.Vector4(), splash: new THREE.Vector4(), settle: new THREE.Vector4() };
function packSoil(out: typeof BATTLE, s: VehicleFieldSoil): void {
  out.deep.set(s.deep[0], s.deep[1], s.deep[2], s.wet);
  out.splash.set(s.splash[0], s.splash[1], s.splash[2], s.spatter);
  out.settle.set(s.settle[0], s.settle[1], s.settle[2], s.settleAmount);
}
packSoil(BATTLE, vehicleFieldSoil('verdant'));
packSoil(GARAGE, GARAGE_SOIL);

/** The wear uniforms every vehicle material reads (materials.ts vehicleAmbientFloorHook binds them). */
export const VEHICLE_FIELD_WEAR_UNIFORMS = Object.freeze({
  // per draw: (coat, settled film, use-wear, soot) the drawn material takes
  uVehWearRole: { value: new THREE.Vector4() },
  // per draw: the vehicle's forward axis in the world (materials.ts setVehicleGroundFromRoot), for the tracks' rooster tail
  uVehWearFwd: { value: new THREE.Vector3(0, 0, 1) },
  // per battle (Garage: the neutral film): deep coat (rgb, wetness), thrown coat (rgb, spatter), film (rgb, amount)
  uVehWearDeep: { value: new THREE.Vector4().copy(BATTLE.deep) },
  uVehWearSplash: { value: new THREE.Vector4().copy(BATTLE.splash) },
  uVehWearSettle: { value: new THREE.Vector4().copy(BATTLE.settle) },
});

let soilSource: typeof BATTLE | null = BATTLE;
/** Point battle builds at a battlefield's soil (materials.ts setCamoBiome: battle start, the map picker, the Studio). */
export function setVehicleFieldSoil(mapId: string | null | undefined): void {
  packSoil(BATTLE, vehicleFieldSoil(mapId));
  if (soilSource === BATTLE) soilSource = null; // rewrite on the next battle draw
}

// ---------------------------------------------------------------------------------------------------------- roles
// (x coat, y settled film, z use-wear, w soot): how much of each a material takes. Rubber, tracks and wheels take the
// coat in full; cloth and wood keep a little less of the thrown coat and all of the film; glass sheds most; the wheel
// bays' near-black recess panels, the wreck's char and every alpha-cut card (nets, leaves, garnish, wire grids) take
// none (an alpha-cut cord near the ground lit almost white under round 4's coat: "the hem read as white lace").
const ROLE_PAINT = Object.freeze(new THREE.Vector4(1, 1, 0, 0));
const ROLE_GEAR = Object.freeze(new THREE.Vector4(0.9, 0.6, 0, 0));
const ROLE_STEEL = Object.freeze(new THREE.Vector4(0.9, 0.8, 0, 0));
const ROLE_SOFT = Object.freeze(new THREE.Vector4(0.85, 1, 0, 0));
const ROLE_GLASS = Object.freeze(new THREE.Vector4(0.25, 0.35, 0, 0));
const ROLE_NONE = Object.freeze(new THREE.Vector4(0, 0, 0, 0));
const ROLES_BY_APPEARANCE: Readonly<Record<string, THREE.Vector4>> = Object.freeze({
  armorPaint: ROLE_PAINT, fittingPaint: ROLE_PAINT,
  wheelPaint: ROLE_GEAR, tireRubber: ROLE_GEAR, trackSteel: ROLE_GEAR, trackPad: ROLE_GEAR, trackBand: ROLE_GEAR,
  gunmetal: ROLE_STEEL,
  canvas: ROLE_SOFT, canvasPale: ROLE_SOFT, wood: ROLE_SOFT,
  opticGlass: ROLE_GLASS,
  gearShadow: ROLE_NONE, burnt: ROLE_NONE,
});
const ROLES_BY_DECOR: Readonly<Record<string, THREE.Vector4>> = Object.freeze({
  Decor_kit: ROLE_PAINT, Decor_cans: ROLE_PAINT, Decor_steel: ROLE_STEEL, Decor_rubber: ROLE_GEAR,
  Decor_canvas: ROLE_SOFT, Decor_burlap: ROLE_SOFT, Decor_wood: ROLE_SOFT, Decor_lens: ROLE_GLASS,
});
/** Explicit roles a builder may set (`material.userData.cotWearRole`); anything else reads its appearance role. */
const ROLES_BY_NAME: Readonly<Record<string, THREE.Vector4>> = Object.freeze({
  paint: ROLE_PAINT, gear: ROLE_GEAR, steel: ROLE_STEEL, soft: ROLE_SOFT, glass: ROLE_GLASS, none: ROLE_NONE,
});
const ROLE_OF = new WeakMap<THREE.Material, THREE.Vector4>();
function resolveRole(material: THREE.Material): THREE.Vector4 {
  const data = material.userData || {};
  const explicit = typeof data.cotWearRole === 'string' ? ROLES_BY_NAME[data.cotWearRole] : undefined;
  if (explicit) return explicit;
  if ((material as THREE.MeshStandardMaterial).alphaTest > 0) return ROLE_NONE;
  const byDecor = ROLES_BY_DECOR[material.name];
  if (byDecor) return byDecor;
  const appearance = typeof data.appearanceRole === 'string' ? ROLES_BY_APPEARANCE[data.appearanceRole] : undefined;
  return appearance ?? ROLE_PAINT;
}
/** The wear role a material draws with (cached per material). */
export function vehicleFieldWearRole(material: THREE.Material): THREE.Vector4 {
  let role = ROLE_OF.get(material);
  if (!role) {
    role = resolveRole(material);
    ROLE_OF.set(material, role);
  }
  return role;
}

let lastRole: THREE.Vector4 | null = null;
/**
 * Per draw (materials.ts setVehicleGroundFromRoot): the drawn material's role and, for a Garage build, the neutral
 * film. Writes only what changed since the last draw: no allocation, a reference compare per draw.
 */
export function bindVehicleFieldWear(garage: boolean, material: THREE.Material | null | undefined): void {
  const source = garage ? GARAGE : BATTLE;
  if (source !== soilSource) {
    VEHICLE_FIELD_WEAR_UNIFORMS.uVehWearDeep.value.copy(source.deep);
    VEHICLE_FIELD_WEAR_UNIFORMS.uVehWearSplash.value.copy(source.splash);
    VEHICLE_FIELD_WEAR_UNIFORMS.uVehWearSettle.value.copy(source.settle);
    soilSource = source;
  }
  const role = material ? vehicleFieldWearRole(material) : ROLE_PAINT;
  if (role !== lastRole) {
    VEHICLE_FIELD_WEAR_UNIFORMS.uVehWearRole.value.copy(role);
    lastRole = role;
  }
}

// ---------------------------------------------------------------------------------------------------------- GLSL
/** Vertex: the wear pattern's frame, each mesh's own (it rides a turning turret, a spinning wheel or a running shoe);
 * every instance of an instanced or batched part takes its own offset, so identical skirt panels or wheels never
 * repeat one pattern (round 4's "identical sawtooth" along the skirts). */
export const FIELD_WEAR_VERTEX_PARS = /* glsl */ `
uniform vec4 uVehGround;
uniform vec3 uVehUp;
uniform vec3 uVehWearFwd;
varying vec3 vCotWearPos;
varying vec3 vCotWearFrame;
vec3 cotWearSeed( const in float id ) {
	return fract( vec3( id * 0.6180339, id * 0.4142136, id * 0.7320508 ) + 0.37 ) * 23.0;
}
`;
/** ...and the vehicle frame per vertex (height above the ground contact, the normal along the vehicle's up and forward),
 * so the fragment does no matrix work: both are linear across a plate, and a smooth part interpolates its normals. */
export const FIELD_WEAR_VERTEX = /* glsl */ `
	vCotWearPos = transformed;
	vec4 cotWearWorld = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		vCotWearPos += cotWearSeed( getIndirectIndex( gl_DrawID ) );
		cotWearWorld = batchingMatrix * cotWearWorld;
	#endif
	#ifdef USE_INSTANCING
		vCotWearPos += cotWearSeed( float( gl_InstanceID ) );
		cotWearWorld = instanceMatrix * cotWearWorld;
	#endif
	cotWearWorld = modelMatrix * cotWearWorld;
	vec3 cotWearN = inverseTransformDirection( transformedNormal, viewMatrix );
	vCotWearFrame = vec3( dot( cotWearWorld.xyz - uVehGround.xyz, uVehUp ), dot( cotWearN, uVehUp ), dot( cotWearN, uVehWearFwd ) );
`;

/** The value noise (inside the receipts' GLSL subset: vehicleFieldWear.selftest.mjs runs these bodies). */
export const FIELD_WEAR_NOISE_GLSL = /* glsl */ `
float cotWearHash( vec2 p ) {
	vec3 q = fract( vec3( p.x, p.y, p.x ) * 0.1031 );
	q += dot( q, vec3( q.y, q.z, q.x ) + 33.33 );
	return fract( ( q.x + q.y ) * q.z );
}
float cotWearNoise( vec2 x ) {
	vec2 i = floor( x );
	vec2 f = fract( x );
	vec2 u = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( cotWearHash( i ), cotWearHash( i + vec2( 1.0, 0.0 ) ), u.x ),
		mix( cotWearHash( i + vec2( 0.0, 1.0 ) ), cotWearHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
`;

export const FIELD_WEAR_FRAGMENT_PARS = /* glsl */ `
uniform vec4 uVehWearRole;
uniform vec4 uVehWearDeep;
uniform vec4 uVehWearSplash;
uniform vec4 uVehWearSettle;
varying vec3 vCotWearPos;
varying vec3 vCotWearFrame;
${FIELD_WEAR_NOISE_GLSL}`;

/**
 * The coat, film and spatter (inside the receipts' GLSL subset). Inputs: wearH (metres above the ground contact along
 * the vehicle's up), wearUp (the face's world normal along that up), wearBack (how squarely it faces the stern: the
 * tracks throw their rooster tail up the rear plate), wearFoot (metres one pixel spans), wearN1 / wearN2
 * (the low and fine noise octaves, 0..1), wearStrength, wearRole, soilDeep, soilSplash, soilSettle. In and out:
 * wearAlbedo (linear), wearRough.
 */
export const FIELD_WEAR_CORE_GLSL = /* glsl */ `
	float wearFar = smoothstep( 0.06, 0.12, wearFoot );
	float wearNear = 1.0 - smoothstep( 0.008, 0.022, wearFoot );
	float n1 = mix( wearN1, 0.5, wearFar );
	float n2 = mix( 0.5, wearN2, wearNear );
	float lineH = wearH - wearBack * 0.35 + ( n1 - 0.5 ) * 0.6 + ( n2 - 0.5 ) * 0.14;
	float coat = 1.0 - smoothstep( 0.2, 1.45, lineH );
	float patchy = min( smoothstep( 0.25, 0.75, coat * 0.85 + ( n2 - 0.5 ) * 0.8 + ( n1 - 0.5 ) * 0.35 ), coat * 2.5 );
	float cover = mix( coat, patchy, wearNear * 0.85 );
	cover *= 0.85 + 0.3 * clamp( - wearUp, 0.0, 1.0 ) + 0.15 * clamp( wearUp, 0.0, 1.0 ) + 0.2 * wearBack;
	float deep = clamp( 1.0 - smoothstep( 0.05, 0.75, lineH ) + ( n1 - 0.5 ) * 0.5, 0.0, 1.0 );
	vec3 coatCol = mix( soilSplash.rgb, soilDeep.rgb, deep ) * ( 0.75 + 0.5 * n2 );
	float coatAmt = clamp( cover * wearStrength * wearRole.x, 0.0, 1.0 );
	wearAlbedo = mix( wearAlbedo, coatCol, coatAmt * 0.85 );
	wearRough = mix( wearRough, mix( 1.0, 0.35, soilDeep.a * deep ), coatAmt );
	float settle = smoothstep( 0.3, 0.85, wearUp ) * soilSettle.a * wearRole.y * ( 0.35 + 0.65 * n1 )
		* ( 1.0 - 0.5 * smoothstep( 1.2, 2.8, wearH ) );
	settle *= mix( 1.0, smoothstep( 0.2, 0.7, n2 ), wearNear * 0.6 );
	float settleAmt = clamp( settle * wearStrength, 0.0, 1.0 ) * 0.55;
	wearAlbedo = mix( wearAlbedo, soilSettle.rgb * ( 0.92 + 0.16 * n1 ), settleAmt );
	wearRough = mix( wearRough, 1.0, settleAmt );
	float spatZone = smoothstep( 0.25, 0.6, wearH ) * ( 1.0 - smoothstep( 0.6, 1.4, lineH - 0.3 ) ) * soilSplash.a;
	float spatCut = mix( 0.6, 0.86, smoothstep( 0.35, 1.45, wearH ) ) - ( n1 - 0.5 ) * 0.45;
	float spat = smoothstep( spatCut, spatCut + 0.05, wearN2 ) * spatZone * wearNear;
	float spatAmt = clamp( spat * wearStrength * wearRole.x, 0.0, 1.0 );
	wearAlbedo = mix( wearAlbedo, mix( soilSplash.rgb, soilDeep.rgb, 0.5 ), spatAmt * 0.85 );
	wearRough = mix( wearRough, mix( 1.0, 0.5, soilDeep.a ), spatAmt );
`;

/**
 * Fragment glue (after the normal maps, before any light reads the surface): the vehicle frame from the vertex stage
 * (a back face of double-sided cloth turns it over), the footprint in uniform control flow, the noise only where the
 * coat or the film can show, then the core.
 */
export const FIELD_WEAR_FRAGMENT = /* glsl */ `
	if ( uVehGround.w > 0.0 && uVehWearRole.x + uVehWearRole.y > 0.0 ) {
		float wearH = vCotWearFrame.x;
		float wearUp = vCotWearFrame.y * faceDirection;
		float wearBack = clamp( - vCotWearFrame.z * faceDirection, 0.0, 1.0 );
		// the pattern's frame and footprint from the screen derivatives (in uniform control flow): the face's own plane in
		// the mesh frame picks the projection (a side plate's z and y, a deck's x and z), so the noise keeps its shape on
		// every plate instead of shearing into diagonal smears
		vec3 wearDx = dFdx( vCotWearPos );
		vec3 wearDy = dFdy( vCotWearPos );
		float wearFoot = length( abs( wearDx ) + abs( wearDy ) );
		vec3 wearFace = abs( cross( wearDx, wearDy ) );
		if ( wearH < 1.75 || wearUp > 0.3 ) {
			vec3 wearP = vCotWearPos;
			vec2 wearQ = wearFace.x > max( wearFace.y, wearFace.z ) ? wearP.zy : ( wearFace.y > wearFace.z ? wearP.xz : wearP.xy );
			float wearN1 = cotWearNoise( wearQ * vec2( 3.0, 2.0 ) );
			float wearN2 = 0.5;
			if ( wearFoot < 0.022 ) wearN2 = cotWearNoise( wearQ * 16.0 + vec2( 7.3, 2.9 ) );
			float wearStrength = uVehGround.w;
			vec4 wearRole = uVehWearRole;
			vec4 soilDeep = uVehWearDeep;
			vec4 soilSplash = uVehWearSplash;
			vec4 soilSettle = uVehWearSettle;
			vec3 wearAlbedo = diffuseColor.rgb;
			float wearRough = roughnessFactor;
			${FIELD_WEAR_CORE_GLSL}
			diffuseColor.rgb = wearAlbedo;
			roughnessFactor = wearRough;
		}
	}
`;
