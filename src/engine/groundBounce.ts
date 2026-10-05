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

/** Fraction of the physical bounce the legacy rig applies (its hemisphere / fill were tuned without it); the grounded
 * model (lightModel.ts) passes 1 through GroundBounceRigInput.gain. */
export const GROUND_BOUNCE_GAIN = 0.6;
/** Share of the view a face turned from a low sun loses to its own object's shadow. */
export const GROUND_BOUNCE_SELF_SHADE = 0.6;
/** Ground-lit share an underside sees (the shaded ground under the object against the lit ground beside it). */
export const GROUND_BOUNCE_UNDERSIDE_LIT = 0.5;
/** Ground-lit floor for a receiver inside a cast shadow (its ground is shaded too). */
export const GROUND_BOUNCE_SHADOWED_RECEIVER = 0.4;
/**
 * 2026-10-04 (the skies lane; Redrock's backlit inselbergs read 0.84–1.00 of the sunlit sand on the into-sun frame):
 * the terrain's round-42 wall sky lift (terrain.ts uWallSkyLift: the fog colour × this gain × the slope and
 * turned-from-the-sun weight, added to a steep face's indirect diffuse) as the light rig resolves it. Round 42 rescued
 * slopes the legacy rig's fixed hemisphere left black; the grounded rig's environment lights a steep face's open sky
 * itself, so there the lift counted that light twice — 0.54–0.71 of the sunlit sand on those faces, which sit at
 * 0.28–0.33 of it without the lift (a backlit wall under a clear sky: about half the dome plus the bounce). The legacy
 * rig (phones, the Preetham tier, the galaxy skies) keeps round 42's gain; the grounded rig takes none
 * (WALL_SKY_LIFT_GROUNDED, a QA knob). One uniform object every terrain program binds; applyGroundBounce (lighting.ts)
 * sets it with the rig's other terms.
 */
export const WALL_SKY_LIFT_LEGACY = 7.0;
export const terrainWallSkyLift: { value: number } = { value: WALL_SKY_LIFT_LEGACY };

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
  /**
   * 2026-10-01 (the grounded light model, lightModel.ts): the sky's diffuse share over the environment's
   * specular scale — the environment stays at the dome's own radiance so a mirror reflects the sky the eye
   * sees, while the shade it lights takes the aerosol and cloud light the clean dome lacks. 1 = the legacy rig.
   */
  uCotSkyDiffuse: THREE.IUniform<number>;
  /**
   * 2026-10-03 (the skies-and-atmosphere lane; the gauntlet's wave 0: grass in a tank's shadow rendered indigo and
   * teal): the share of the sky's hue its diffuse light keeps. The environment is the clean dome, a Rayleigh sky whose
   * cosine-weighted light runs B/R 3.3–4 (a colour temperature far past 20 000 K); the light real open shade takes from
   * a clear sky — the aerosol, the whitened horizon and the fair-weather cloud the clean dome leaves out, the light
   * SKY_DIFFUSE_GAIN adds — runs 9 000–15 000 K (B/R about 1.6–2.2). The diffuse share keeps this fraction of the
   * dome's colour about its luminance, so the shade's level is unchanged and only its hue settles; the specular share
   * (a mirror, a wet road) keeps the dome's own colour. 1 = the legacy rig.
   */
  uCotSkyChroma: THREE.IUniform<number>;
  /**
   * 2026-10-03: the dim the ambient takes inside the sun's shadow (the occluder hides part of the sky and the lit
   * ground), per channel: the legacy rig keeps its painted cool shade (lighting.ts SHADOW_AMBIENT_DIM), the physical
   * rig dims neutrally at the same luminance — its shade takes its hue from the sky light itself.
   */
  uCotShadowDim: THREE.IUniform<THREE.Vector3>;
  /**
   * 2026-10-03 (the shade-fill lane): 1 where the shadow's ambient dim keeps to the faces turned toward the sun. The
   * occluder that shades a face hides the sun's side of its sky — the circumsolar light, the brightest part of a clear
   * sky — so a face in a cast shadow keeps the dim; a face turned from the sun sees none of that side (its own
   * environment light already leaves it out), so its sky stays whole. 0 = the legacy rig's dim on every shadowed face.
   */
  uCotShadowFacing: THREE.IUniform<number>;
  /**
   * 2026-10-04 (the skies lane: the light under a closed deck): the share of the shadow's dims (the ambient's and the
   * specular's) a cascade's shadow keeps. They stand for the circumsolar sky an occluder hides; a closed deck's light
   * comes from every direction alike — its forward lobe is broad — so an occluder hides no more of it than its own small
   * solid angle (the contact shadows' business), and the dims fade with the overcast. 1 = the full dims (the legacy rig,
   * an open sky).
   */
  uCotShadowDepth: THREE.IUniform<number>;
}

export function createGroundBounceUniforms(): GroundBounceUniforms {
  return {
    uCotBounceRad: { value: new THREE.Vector3() },
    uCotBounceHemi: { value: new THREE.Vector3() },
    uCotBounceSun: { value: new THREE.Vector3(0, 1, 0) },
    uCotSkyDiffuse: { value: 1 },
    uCotSkyChroma: { value: 1 },
    uCotShadowDim: { value: new THREE.Vector3(1, 1, 1) },
    uCotShadowFacing: { value: 0 },
    uCotShadowDepth: { value: 1 },
  };
}

/** Attach the shared uniform objects to a compiling material's shader (the CSM pattern: one object, every program). */
export function attachGroundBounceUniforms(
  shader: { uniforms: Record<string, THREE.IUniform> }, uniforms: GroundBounceUniforms,
): void {
  shader.uniforms.uCotBounceRad = uniforms.uCotBounceRad;
  shader.uniforms.uCotBounceHemi = uniforms.uCotBounceHemi;
  shader.uniforms.uCotBounceSun = uniforms.uCotBounceSun;
  shader.uniforms.uCotSkyDiffuse = uniforms.uCotSkyDiffuse;
  shader.uniforms.uCotSkyChroma = uniforms.uCotSkyChroma;
  shader.uniforms.uCotShadowDim = uniforms.uCotShadowDim;
  shader.uniforms.uCotShadowFacing = uniforms.uCotShadowFacing;
  shader.uniforms.uCotShadowDepth = uniforms.uCotShadowDepth;
}

export interface GroundBounceRigInput {
  enabled: boolean;
  sunDir: Vec3Like;
  sunColor: THREE.Color;
  sunIntensity: number;
  groundTone: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  /** 2026-10-01: the share of the physical bounce applied (the grounded model applies all of it); default the legacy gain. */
  gain?: number;
}

/** Refresh the shared uniforms from the light rig (setSun, preset changes, the policy). */
export function applyGroundBounceRig(uniforms: GroundBounceUniforms, rig: GroundBounceRigInput): void {
  // the vehicle form fill (vehicles/materials.ts) reads the sun's bearing from this uniform with the bounce off too
  uniforms.uCotBounceSun.value.set(rig.sunDir.x, rig.sunDir.y, rig.sunDir.z).normalize();
  if (!rig.enabled) {
    uniforms.uCotBounceRad.value.set(0, 0, 0);
    return;
  }
  const radiance = groundBounceRadiance(rig.sunColor, rig.sunIntensity, rig.sunDir, rig.groundTone, rig.gain ?? GROUND_BOUNCE_GAIN);
  uniforms.uCotBounceRad.value.set(radiance.r, radiance.g, radiance.b);
  uniforms.uCotBounceHemi.value.set(
    rig.hemiGround.r * rig.hemiIntensity, rig.hemiGround.g * rig.hemiIntensity, rig.hemiGround.b * rig.hemiIntensity);
}

const f = (x: number): string => x.toFixed(4);

/** Fragment-scope declarations (prepended to lights_pars_begin under USE_CSM). */
export const GROUND_BOUNCE_GLSL_PARS = /* glsl */ `
uniform vec3 uCotBounceRad;
uniform vec3 uCotBounceHemi;
uniform vec3 uCotBounceSun;
uniform float uCotSkyDiffuse;
uniform float uCotSkyChroma;
uniform vec3 uCotShadowDim;
uniform float uCotShadowFacing;
uniform float uCotShadowDepth;
`;

/**
 * The term, inserted in lights_fragment_end before RE_IndirectDiffuse (inside its #if): `irradiance`,
 * `geometryNormal` (view space), `viewMatrix` and `cotSunVis` are in scope there.
 */
export const GROUND_BOUNCE_GLSL_TERM = /* glsl */ `
	iblIrradiance = mix( vec3( dot( iblIrradiance, vec3( 0.2126, 0.7152, 0.0722 ) ) ), iblIrradiance, uCotSkyChroma ) * uCotSkyDiffuse;
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
