import * as THREE from 'three';

/** (240, the coordinator: "the pooled lamp light washes the facade evenly up to the roofline with no shadow and no height
 *  falloff"; the 240 light census: cutting the night pool's two building lights took the warm wash off Steinburg's
 *  facades to their eaves, while the bloom and the windows' emission lay only round the lamp heads) a point light lights
 *  the wall three metres over its glass as it lights the pavement three metres under it. The night pool's town lamps are
 *  marked by their decay (2 + 0.004: a 1 % change of the falloff at the lamp's 17 m reach, and still apart from 2 at
 *  mediump) and every lit program shapes them in three's own point-light path as a lantern, whose cap shades the sky side:
 *  - below the glass, and anywhere within LAMP_HALO_M of it, the light is the point light's as before: the wall round the
 *    lamp's head keeps its warm halo (233's lantern cut it from the glass up, and lost: "the far lamp lost the warm halo
 *    round its head"; the 229 cones that dimmed the facade beside the lamp lost both blind rounds);
 *  - above the glass and farther out, it falls away with the lit point's elevation to LAMP_UP_FLOOR (by ~50 degrees up and
 *    LAMP_FADE_M from the glass): the facade lit round the lamp and fading up the next storey, the roofline dark;
 *  - the ground under the lamp takes LAMP_POOL_GAIN more, so its pool reads on the pavement.
 *  Every other point light (the muzzle flash, a burst, a wreck's fire) is untouched. */
export const LAMP_LIGHT_DECAY = 2.004;
const LAMP_MARK_TOLERANCE = 0.0015;
const LAMP_UP_FLOOR = 0.15, LAMP_POOL_GAIN = 0.35, LAMP_HALO_M = 1.0, LAMP_FADE_M = 3.2;

const ATTENUATION = 'light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );';
const MARK = 'cotLampUp';
const f = (v: number): string => v.toFixed(4);

/** Shape the marked lamp lights in three's point-light path; idempotent, before compiles. */
export function shapeLampPointLights(): boolean {
  const chunk = THREE.ShaderChunk as unknown as Record<string, string>;
  const src = chunk.lights_pars_begin;
  if (typeof src !== 'string') return false;
  if (src.includes(MARK)) return true;
  if (!src.includes(ATTENUATION)) return false;
  chunk.lights_pars_begin = src.replace(ATTENUATION, `${ATTENUATION}
		if ( abs( pointLight.decay - ${f(LAMP_LIGHT_DECAY)} ) < ${f(LAMP_MARK_TOLERANCE)} ) {
			// (lampLightShape.ts) a town lamp's lantern: the lit point's elevation seen from the glass (view space) and its
			// distance from it
			float ${MARK} = dot( -light.direction, normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz ) );
			float cotLampAbove = smoothstep( 0.05, 0.75, ${MARK} ) * smoothstep( ${f(LAMP_HALO_M)}, ${f(LAMP_FADE_M)}, lightDistance );
			light.color *= ( 1.0 - ${f(1 - LAMP_UP_FLOOR)} * cotLampAbove ) * ( 1.0 + ${f(LAMP_POOL_GAIN)} * smoothstep( 0.55, 0.95, -${MARK} ) );
		}`);
  return true;
}
