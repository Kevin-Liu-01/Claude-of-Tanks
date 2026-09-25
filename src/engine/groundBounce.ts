/**
 * groundBounce.ts — round 69 (2026-09-24): sunlight bounced off the ground onto the faces that look at it.
 *
 * The light rig lights every lit material with the CSM sun, a HemisphereLight whose ground pole is one constant
 * colour at the map's hemiIntensity, the environment and the anti-sun fill. A hull underside, a wheel arch, a
 * hull flank, the eaves of a barn, a wall base — every face turned toward the ground — sees sunlit ground over
 * its lower hemisphere, and sunlit ground is far brighter than the hemisphere's assumed ground pole: on a sunny
 * map the one diffuse bounce off the ground is the dominant indirect light on those faces (tidewater's ground
 * bounce; here without its baked map — the terrain material holds its sixteen texture units and every material
 * would need the sampler, so the term is analytic).
 *
 * The term is an irradiance added to Three's indirect diffuse before RE_IndirectDiffuse, so the material's own
 * albedo, AO and BRDF apply. For a receiver normal n (world) and the rig's sun:
 *
 *   view factor  V(n)      = (1 − n.y) / 2            the cosine-weighted share of the lower hemisphere
 *   ground lit   G(n, sun) = mix( 0.5, S(n, sun), clamp( n.y + 1, 0, 1 ) )
 *                S = 1 − max( −n.xz · sunH, 0 ) · (1 − sun.y) · 0.6   (a face turned from a low sun looks at the
 *                ground its own object shades; an underside sees half shaded ground under the object, half lit
 *                ground beside it)
 *   receiver     R(v)      = mix( 0.4, 1, v )        a face inside a cast shadow (a building's, a canopy's) stands
 *                                                    on shaded ground too — v is the CSM visibility the fragment
 *                                                    already carries (cotSunVis)
 *   ground       L         = sunColour · sunIntensity · max( sun.y, 0 ) · groundTone · gain
 *                                                    the irradiance sunlit flat ground reflects (flat-ground sun
 *                                                    irradiance × the ground's albedo tone — the hemisphere's own
 *                                                    ground colour, the light rig's model of the terrain)
 *   E_bounce               = max( L · G · R − hemiGround · hemiIntensity, 0 ) · V(n)
 *
 * Energy conservation: the hemisphere light already gives every face hemiGround · hemiIntensity · V(n) from
 * below and hemiSky · hemiIntensity · (1 − V(n)) from above — the upper and lower view factors sum to one, and the
 * round-42 sky light on steep terrain faces belongs to the upper half. The bounce is only the EXCESS of the
 * sunlit ground over the ground the hemisphere assumed, so nothing is counted twice, a shaded ground (G · R
 * small) adds nothing and never subtracts, and no face receives more from below than sunlit ground can reflect:
 * E_bounce ≤ L · V(n). `groundBounceIrradiance` is the CPU twin the receipt pins against the GLSL literals.
 *
 * Wiring (lighting.ts): the uniforms ride into every CSM material through setupShadowMaterial (uCotBounceRad = L,
 * uCotBounceHemi = hemiGround · hemiIntensity, uCotBounceSun = the world sun direction) and the term lives in the
 * lights_fragment_end patch beside the ambient shadow dim; a zero uCotBounceRad (the mobile tier, `?fx=off`, a
 * preset without the lever, a sun below the horizon) skips the block.
 */
import * as THREE from 'three';

/** Fraction of the physical bounce applied: the rig's hemisphere / fill were tuned without it. */
export const GROUND_BOUNCE_GAIN = 0.6;
/** Share of the view a face turned from a low sun loses to its own object's shadow. */
export const GROUND_BOUNCE_SELF_SHADE = 0.6;
/** Ground-lit share an underside sees (the shaded ground under the object against the lit ground beside it). */
export const GROUND_BOUNCE_UNDERSIDE_LIT = 0.5;
/** Ground-lit floor for a receiver inside a cast shadow (its ground is shaded too). */
export const GROUND_BOUNCE_SHADOWED_RECEIVER = 0.4;

export interface Vec3Like { x: number; y: number; z: number; }

/** Lower-hemisphere view factor of a normal: 1 straight down, 1/2 sideways, 0 straight up. */
export function groundBounceViewFactor(normalY: number): number {
  return THREE.MathUtils.clamp(0.5 - 0.5 * normalY, 0, 1);
}

/** The share of the ground a face looks at that is sunlit (the object's own shadow and the low sun). */
export function groundBounceGroundLit(normal: Vec3Like, sunDir: Vec3Like): number {
  const h = Math.hypot(sunDir.x, sunDir.z);
  const sunHx = h > 1e-3 ? sunDir.x / h : 0, sunHz = h > 1e-3 ? sunDir.z / h : 0;
  const away = Math.max(-(normal.x * sunHx + normal.z * sunHz), 0);
  const low = THREE.MathUtils.clamp(1 - sunDir.y, 0, 1);
  const side = 1 - away * low * GROUND_BOUNCE_SELF_SHADE;
  return THREE.MathUtils.lerp(GROUND_BOUNCE_UNDERSIDE_LIT, side, THREE.MathUtils.clamp(normal.y + 1, 0, 1));
}

/** Receiver factor from its own CSM visibility. */
export function groundBounceReceiver(sunVisibility: number): number {
  return THREE.MathUtils.lerp(GROUND_BOUNCE_SHADOWED_RECEIVER, 1, THREE.MathUtils.clamp(sunVisibility, 0, 1));
}

/** The irradiance sunlit flat ground reflects, per channel (L above), including the gain. */
export function groundBounceRadiance(
  sunColor: THREE.Color, sunIntensity: number, sunDir: Vec3Like, groundTone: THREE.Color, gain = GROUND_BOUNCE_GAIN,
): THREE.Color {
  const k = sunIntensity * Math.max(sunDir.y, 0) * gain;
  return new THREE.Color(sunColor.r * groundTone.r * k, sunColor.g * groundTone.g * k, sunColor.b * groundTone.b * k);
}

/** The bounce irradiance one receiver gets: the CPU twin of the GLSL term. */
export function groundBounceIrradiance(
  normal: Vec3Like, sunDir: Vec3Like, sunVisibility: number, radiance: THREE.Color, hemiGroundIrradiance: THREE.Color,
): THREE.Color {
  const factor = groundBounceGroundLit(normal, sunDir) * groundBounceReceiver(sunVisibility);
  const view = groundBounceViewFactor(normal.y);
  return new THREE.Color(
    Math.max(radiance.r * factor - hemiGroundIrradiance.r, 0) * view,
    Math.max(radiance.g * factor - hemiGroundIrradiance.g, 0) * view,
    Math.max(radiance.b * factor - hemiGroundIrradiance.b, 0) * view,
  );
}

export interface GroundBounceUniforms {
  uCotBounceRad: THREE.IUniform<THREE.Vector3>;
  uCotBounceHemi: THREE.IUniform<THREE.Vector3>;
  uCotBounceSun: THREE.IUniform<THREE.Vector3>;
}

export function createGroundBounceUniforms(): GroundBounceUniforms {
  return {
    uCotBounceRad: { value: new THREE.Vector3() },
    uCotBounceHemi: { value: new THREE.Vector3() },
    uCotBounceSun: { value: new THREE.Vector3(0, 1, 0) },
  };
}

/** Attach the shared uniform objects to a compiling material's shader (the CSM pattern: one object, every program). */
export function attachGroundBounceUniforms(
  shader: { uniforms: Record<string, THREE.IUniform> }, uniforms: GroundBounceUniforms,
): void {
  shader.uniforms.uCotBounceRad = uniforms.uCotBounceRad;
  shader.uniforms.uCotBounceHemi = uniforms.uCotBounceHemi;
  shader.uniforms.uCotBounceSun = uniforms.uCotBounceSun;
}

export interface GroundBounceRigInput {
  enabled: boolean;
  sunDir: Vec3Like;
  sunColor: THREE.Color;
  sunIntensity: number;
  groundTone: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
}

/** Refresh the shared uniforms from the light rig (setSun, preset changes, the policy). */
export function applyGroundBounceRig(uniforms: GroundBounceUniforms, rig: GroundBounceRigInput): void {
  if (!rig.enabled) {
    uniforms.uCotBounceRad.value.set(0, 0, 0);
    return;
  }
  const radiance = groundBounceRadiance(rig.sunColor, rig.sunIntensity, rig.sunDir, rig.groundTone);
  uniforms.uCotBounceRad.value.set(radiance.r, radiance.g, radiance.b);
  uniforms.uCotBounceHemi.value.set(
    rig.hemiGround.r * rig.hemiIntensity, rig.hemiGround.g * rig.hemiIntensity, rig.hemiGround.b * rig.hemiIntensity);
  uniforms.uCotBounceSun.value.set(rig.sunDir.x, rig.sunDir.y, rig.sunDir.z).normalize();
}

const f = (x: number): string => x.toFixed(4);

/** Fragment-scope declarations (prepended to lights_pars_begin under USE_CSM). */
export const GROUND_BOUNCE_GLSL_PARS = /* glsl */ `
uniform vec3 uCotBounceRad;
uniform vec3 uCotBounceHemi;
uniform vec3 uCotBounceSun;
`;

/**
 * The term, inserted in lights_fragment_end before RE_IndirectDiffuse (inside its #if): `irradiance`,
 * `geometryNormal` (view space), `viewMatrix` and `cotSunVis` are in scope there.
 */
export const GROUND_BOUNCE_GLSL_TERM = /* glsl */ `
	if ( dot( uCotBounceRad, vec3( 1.0 ) ) > 0.0 ) {
		vec3 cotNw = normalize( ( vec4( geometryNormal, 0.0 ) * viewMatrix ).xyz );
		vec2 cotSunH = uCotBounceSun.xz / max( length( uCotBounceSun.xz ), 1e-3 );
		float cotSide = 1.0 - max( -dot( cotNw.xz, cotSunH ), 0.0 ) * clamp( 1.0 - uCotBounceSun.y, 0.0, 1.0 ) * ${f(GROUND_BOUNCE_SELF_SHADE)};
		float cotGroundLit = mix( ${f(GROUND_BOUNCE_UNDERSIDE_LIT)}, cotSide, clamp( cotNw.y + 1.0, 0.0, 1.0 ) );
		float cotRecv = mix( ${f(GROUND_BOUNCE_SHADOWED_RECEIVER)}, 1.0, clamp( cotSunVis, 0.0, 1.0 ) );
		float cotView = clamp( 0.5 - 0.5 * cotNw.y, 0.0, 1.0 );
		irradiance += max( uCotBounceRad * ( cotGroundLit * cotRecv ) - uCotBounceHemi, vec3( 0.0 ) ) * cotView;
	}
`;
