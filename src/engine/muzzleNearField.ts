import * as THREE from 'three';

/**
 * (271, the close-up lane's Lakeside 2A7V hero stills: "every face of its own gun that faces forward burns out to flat
 * cream rings ... at least 90 ms after the peak") A gun's muzzle light (fx/effects.ts, 460 cd at a 120 mm bore, decay 2)
 * sits 0.15 m behind its own muzzle. Its gun's forward faces (the muzzle face, the fume-extractor and thermal-sleeve
 * collars, the reference-sensor box, the mount's sleeve) face it on the bore axis at full incidence from 0.07 to 4 m:
 * measured on the built 2A7V at the pulse's peak, 8x the sun on the median face and up to 800x on the nearest, so they
 * clip even at a few percent of the peak, while the tube itself, at grazing incidence, stays dark: rings. Moving the
 * light ahead of the muzzle changes nothing, and no single intensity serves both ends (an intensity bounded by the
 * nearest face, or a lower peak until the collars stop clipping, leaves the hull front and the ground 1-2 % of the kiss
 * the lighting rounds tuned).
 *
 * The bound is the near field the point light lacks: on the shooter's own gun, the light falls off as if seen from no
 * nearer than `radius` (a soft floor, max(d^2, 0.0625) / (d^8 + radius^8)^(1/4) on three's own falloff), the radius at
 * which the pulse's peak gives MUZZLE_NEAR_SUN_K x the sun. The gun is the capsule round the line of fire behind the
 * light (from MUZZLE_NEAR_AHEAD_M ahead of it), MUZZLE_NEAR_RADIUS_M round the bore and fading out over
 * MUZZLE_NEAR_FADE_M more: across the fleet every recoiling gun face that near the light lies within 0.28 m of the bore
 * (tube, collars, fume extractor, sensor box), and inside the capsule besides it only the gun's mount sleeve and the
 * turret face round the mantlet, the shooter's own forward faces as well; a wall or a bush the gun is pressed into would
 * be near field too. The hull front, the ground, every other vehicle and every other point light keep their light
 * unchanged. Every cascade-shadow material (lighting.ts setupShadowMaterial: the fleet's and the world's) wraps three's
 * point light with MUZZLE_NEAR_GLSL (attachMuzzleNearField), outside the fleet's own modules so no generated fleet output
 * moves; the effects publish the pulse each frame its gun's light burns.
 */
/** The gun's peak irradiance from its own pulse, in suns. Measured on the Lakeside 2A7V stills (2160p, both lenses, the
 *  shot 33 ms old): unbound, the collars took hundreds of suns and 60 % of their pixels clipped to cream (209, 202, 172);
 *  at 3 a pale khaki ring stayed (176, 157, 97; the brightest percent at 192 of the 200 clip line); at 2 a warm lit face
 *  (163, 143, 85) against (67, 76, 51) unlit, nothing clipped, with room for a sand paint's three to four times the
 *  albedo. The hull front and the ground kept 99.5-100 % of their pulse at either. */
export const MUZZLE_NEAR_SUN_K = 2;
export const MUZZLE_NEAR_RADIUS_M = 0.32, MUZZLE_NEAR_FADE_M = 0.16, MUZZLE_NEAR_AHEAD_M = 0.5;
/** the dimmest sun the bound reckons with (a night flash keeps a dusk sun's worth on its gun), as the blast light's cap */
const MUZZLE_NEAR_SUN_FLOOR = 2;
/** three's point-light falloff floor in these programs (renderer.ts limitPointLightFalloff: 0.25 m) */
const FALLOFF_FLOOR_M2 = 0.0625;

const UNIFORMS = {
  /** xyz the burning gun pulse's light (world), w its near-field radius (m; 0 while no gun's pulse burns). (272) It starts
   *  unpublished: three's `new Vector4()` is (0, 0, 0, 1), a 1 m near field at the origin that no owner could release. */
  uCotMuzzleSeat: { value: new THREE.Vector4(0, 0, 0, 0) },
  /** the pulse's line of fire (world, unit) */
  uCotMuzzleBore: { value: new THREE.Vector3(0, 0, 1) },
};
let publisher: object | null = null;

/** The near-field radius (m) of a gun pulse whose peak (cd, as the light will reach it) burns under a sun this bright. */
export function muzzleNearRadiusM(peakCd: number, sunIntensity: number): number {
  const sun = Math.max(MUZZLE_NEAR_SUN_FLOOR, Number.isFinite(sunIntensity) ? sunIntensity : MUZZLE_NEAR_SUN_FLOOR);
  return Number.isFinite(peakCd) && peakCd > 0 ? Math.sqrt(peakCd / (MUZZLE_NEAR_SUN_K * sun)) : 0;
}

/** This frame's burning gun pulse: its light's world seat, its line of fire and its near-field radius (m). */
export function publishMuzzleNearField(owner: object, seat: THREE.Vector3, bore: THREE.Vector3, radiusM: number): void {
  if (!(radiusM > 0) || !Number.isFinite(seat.x + seat.y + seat.z) || !(bore.lengthSq() > 1e-8)) {
    releaseMuzzleNearField(owner);
    return;
  }
  publisher = owner;
  UNIFORMS.uCotMuzzleSeat.value.set(seat.x, seat.y, seat.z, radiusM);
  UNIFORMS.uCotMuzzleBore.value.copy(bore).normalize();
}

/** The owner's pulse is out: no bound (another owner's live pulse keeps its own). */
export function releaseMuzzleNearField(owner: object): void {
  if (publisher !== owner) return;
  publisher = null;
  UNIFORMS.uCotMuzzleSeat.value.w = 0;
}

/** A lit program's hook (lighting.ts setupShadowMaterial): the shared uniforms, and MUZZLE_NEAR_GLSL after three's lights. */
export function attachMuzzleNearField(shader: { uniforms: Record<string, unknown>; fragmentShader: string }): void {
  Object.assign(shader.uniforms, UNIFORMS);
  if (shader.fragmentShader.includes('cotMuzzleNearPointLightInfo')) return;
  shader.fragmentShader = shader.fragmentShader.replace('#include <lights_pars_begin>', `#include <lights_pars_begin>\n${MUZZLE_NEAR_GLSL}`);
}

/**
 * The factor the shader puts on the light that reaches `offset` (world, from the light to the lit point): 1 off the
 * gun, the soft near-field floor on it. The CPU form of MUZZLE_NEAR_GLSL for receipts.
 */
export function muzzleNearFieldFactor(offset: THREE.Vector3, bore: THREE.Vector3, radiusM: number): number {
  if (!(radiusM > 0)) return 1;
  const back = -offset.dot(bore), d2 = offset.lengthSq();
  if (back < -MUZZLE_NEAR_AHEAD_M) return 1;
  const w = 1 - smoothstep(MUZZLE_NEAR_RADIUS_M, MUZZLE_NEAR_RADIUS_M + MUZZLE_NEAR_FADE_M, Math.sqrt(Math.max(d2 - back * back, 0)));
  if (!(w > 0)) return 1;
  const n2 = radiusM * radiusM;
  const k = Math.max(d2, FALLOFF_FLOOR_M2) / Math.sqrt(Math.sqrt(d2 * d2 * d2 * d2 + n2 * n2 * n2 * n2));
  return 1 + (k - 1) * w;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

const f = (v: number): string => v.toFixed(4);

/**
 * Placed after `#include <lights_pars_begin>` in a lit program: every point light's incident light, then, for the
 * published gun pulse's light (its seat within 1 cm) on a fragment inside its gun's capsule, the near-field floor. World
 * offsets come back from the view-space light and fragment through the view matrix's rotation (NIGHT_OWN_GUN_GLSL's).
 */
export const MUZZLE_NEAR_GLSL = `#if NUM_POINT_LIGHTS > 0
uniform vec4 uCotMuzzleSeat;
uniform vec3 uCotMuzzleBore;
void cotMuzzleNearPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
	getPointLightInfo( pointLight, geometryPosition, light );
	if ( uCotMuzzleSeat.w <= 0.0 || ! light.visible ) return;
	vec3 cotSeat = cameraPosition + ( vec4( pointLight.position, 0.0 ) * viewMatrix ).xyz - uCotMuzzleSeat.xyz;
	if ( dot( cotSeat, cotSeat ) > 1e-4 ) return;
	vec3 cotOff = ( vec4( geometryPosition - pointLight.position, 0.0 ) * viewMatrix ).xyz;
	float cotBack = - dot( cotOff, uCotMuzzleBore );
	float cotD2 = dot( cotOff, cotOff );
	float cotGun = ( 1.0 - smoothstep( ${f(MUZZLE_NEAR_RADIUS_M)}, ${f(MUZZLE_NEAR_RADIUS_M + MUZZLE_NEAR_FADE_M)}, sqrt( max( cotD2 - cotBack * cotBack, 0.0 ) ) ) )
		* step( ${f(-MUZZLE_NEAR_AHEAD_M)}, cotBack );
	if ( cotGun <= 0.0 ) return;
	float cotN2 = uCotMuzzleSeat.w * uCotMuzzleSeat.w;
	float cotNear = max( cotD2, ${f(FALLOFF_FLOOR_M2)} ) / sqrt( sqrt( cotD2 * cotD2 * cotD2 * cotD2 + cotN2 * cotN2 * cotN2 * cotN2 ) );
	light.color *= mix( 1.0, cotNear, cotGun );
}
#define getPointLightInfo cotMuzzleNearPointLightInfo
#endif
`;
