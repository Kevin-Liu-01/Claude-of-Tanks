import * as THREE from 'three';

/** (233, the looks lane's 228 follow-up: "a lamp's point light washes the adjacent facade evenly up to the roofline, with
 *  no height falloff") a point light lights the wall a metre over its glass exactly as it lights the pavement a metre
 *  under it, so a town lamp beside a frontage drew the wall's whole height. The night pool's lamp lights are marked by
 *  their decay (2 + 0.004: a 1 % change of the falloff at the 17 m reach, and still apart from 2 at mediump) and every
 *  lit program shapes them in three's own point-light path as a lantern's (its cap shades the sky side): below the glass
 *  the light is the point light's as before (the facade beside the lamp keeps its warm patch; the 229 cones that dimmed
 *  it lost both blind rounds), above it the light falls away with the ray's elevation, to a tenth by ~55 degrees up (the
 *  wall lit to the lamp's head and fading over the next two metres, the roofline dark), and the ground under the lamp
 *  takes a third more (the pool). Every other point light is untouched. */
export const LAMP_LIGHT_DECAY = 2.004;
const LAMP_MARK_TOLERANCE = 0.0015;
/** The light kept straight up from the glass (the lantern's cap), and the pool's gain at the nadir. */
const LAMP_UP_FLOOR = 0.1, LAMP_POOL_GAIN = 0.35;

const ATTENUATION = 'light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );';
const MARK = 'cotLampUp';

/** Shape the marked lamp lights in three's point-light path; idempotent, before compiles. */
export function shapeLampPointLights(): boolean {
  const chunk = THREE.ShaderChunk as unknown as Record<string, string>;
  const src = chunk.lights_pars_begin;
  if (typeof src !== 'string') return false;
  if (src.includes(MARK)) return true;
  if (!src.includes(ATTENUATION)) return false;
  chunk.lights_pars_begin = src.replace(ATTENUATION, `${ATTENUATION}
		if ( abs( pointLight.decay - ${LAMP_LIGHT_DECAY.toFixed(3)} ) < ${LAMP_MARK_TOLERANCE.toFixed(4)} ) {
			// (lampLightShape.ts) a town lamp's lantern: the lit point's elevation seen from the glass, in view space
			float ${MARK} = dot( -light.direction, normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz ) );
			light.color *= ( 1.0 - ${(1 - LAMP_UP_FLOOR).toFixed(2)} * smoothstep( -0.1, 0.8, ${MARK} ) )
				* ( 1.0 + ${LAMP_POOL_GAIN.toFixed(2)} * smoothstep( 0.55, 0.95, -${MARK} ) );
		}`);
  return true;
}
