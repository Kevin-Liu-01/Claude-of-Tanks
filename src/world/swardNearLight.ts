// src/world/swardNearLight.ts — a grass blade's light from a lamp close by (229; the barrel-glow lane's night critics, on
// both builds: "thin grass blades next to the lamps glow bright yellow-green", vertical streaks beside a turret's lamps and
// blades in the frame's corners).
//
// A vehicle's headlight is 1200 cd: a blade a metre in front of it takes ~1200 lux and one 3 m off ~130, while the street
// lamp's pool lies at ~10 lux at its foot and a headlight's beam on the ground ahead at ~10-15 — and the night camera is
// opened for the moonlit field at a fraction of a lux. A point source's inverse square holds only where the lamp is small
// beside its distance; in its near field a real lamp's lens and housing spread and shade it, and a thin blade lit edge-on
// in it is a sliver the eye sees saturate to the lamp's colour, not a neon line. So a blade's light from each source
// passes unchanged up to SWARD_NEAR_KNEE (over the brightest pool a lamp lays on the ground: every pool, the sun's and the
// moon's light as they were) and saturates softly toward SWARD_NEAR_CAP above it — at most about half again the brightest
// pool, so a blade beside a lamp reads lit as the pool round it is, not as a line of light — keeping its colour. Grass
// only: the ground, the hulls and the walls keep their light, so the pools are as bright as before. (The round's first
// cap, 40, still drew the blades before a turret's lamps near-white: both blind critics, "glowing lime blades".)
//
// Both grass families (tallGrass.ts, the blades; vegetation.ts, the carpet's tufts) are Lambert: the block replaces three's
// RE_Direct after `lights_lambert_pars_fragment` with the same Lambert term through the knee (sun, moon, lamps, flashes).

/** Lux a blade takes from one source unchanged (over every lamp pool: the street lamp's ~9.9 at its foot). */
export const SWARD_NEAR_KNEE = 10;
/** Lux a blade's light from one source approaches, however near the source. */
export const SWARD_NEAR_CAP = 16;

/** The knee in numbers (the receipts' mirror of the shader's). */
export function swardNearLight(lux: number): number {
  if (!(lux > SWARD_NEAR_KNEE)) return lux;
  const over = lux - SWARD_NEAR_KNEE;
  return SWARD_NEAR_KNEE + over / (1 + over / (SWARD_NEAR_CAP - SWARD_NEAR_KNEE));
}

/** The Lambert term through the knee, as three's RE_Direct for a grass program (after `lights_lambert_pars_fragment`). */
export const SWARD_NEAR_LIGHT_GLSL = /* glsl */ `
void RE_Direct_CotSward( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = saturate( dot( geometryNormal, directLight.direction ) ) * directLight.color;
	float cotLux = max( max( irradiance.r, irradiance.g ), irradiance.b );
	if ( cotLux > ${SWARD_NEAR_KNEE.toFixed(1)} ) {
		float cotOver = cotLux - ${SWARD_NEAR_KNEE.toFixed(1)};
		irradiance *= ( ${SWARD_NEAR_KNEE.toFixed(1)} + cotOver / ( 1.0 + cotOver / ${(SWARD_NEAR_CAP - SWARD_NEAR_KNEE).toFixed(1)} ) ) / cotLux;
	}
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#undef RE_Direct
#define RE_Direct RE_Direct_CotSward
`;

/** Install the near-light knee in a grass program's fragment shader (a stand-in shader without the chunk is left as is). */
export function installSwardNearLight(shader: { fragmentShader: string }): void {
  const anchor = '#include <lights_lambert_pars_fragment>';
  if (shader.fragmentShader.includes(anchor) && !shader.fragmentShader.includes('RE_Direct_CotSward')) {
    shader.fragmentShader = shader.fragmentShader.replace(anchor, `${anchor}\n${SWARD_NEAR_LIGHT_GLSL}`);
  }
}
