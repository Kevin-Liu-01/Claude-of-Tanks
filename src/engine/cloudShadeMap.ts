/**
 * cloudShadeMap.ts — the clouds' shadows on every lit surface, by one path (2026-10-03, the skies-and-atmosphere lane).
 *
 * Until now the volumetric layer cast its shadows through the cascades: a gobo plane per cascade whose depth material
 * discarded by an interleaved-gradient dither of the cloud's shade (up to 62 % of the texels). Three's PCF read that
 * dither with five fixed Vogel taps, and on the high tier (no TAA) neither noise averaged out: the ground lane traced a
 * whole family of the gauntlet's defects to it — the "uniform stippled dot pattern" (Saltmere Bay, Sirocco), the
 * "concentric arcs" and "weave tile" (Saltmere, Obsidian Caldera), the "checkerboard / diamond tiling" and the
 * "contour-like streaks" (Frontier Basin, the ring faces) — all ending at the cascades' 700 m, all gone with the gobos
 * off (Bayer, white-hash and R2 dithers alias alike: dithered depth coverage itself was the fault).
 *
 * Now the layer renders the shade undithered into one map — the share of the sun a cloud takes where the sun's ray
 * crosses the cloud base (the gobos' field and core, CLOUD_SHADOW_CORE at most), 512² over 12 km around the camera at
 * the cloud base, snapped to its texel and refreshed on a schedule (volumetricClouds.ts) — and every material that joins
 * the cascades multiplies its sun term by the share left (lighting.ts patches three's shared chunks; setupShadowMaterial
 * sets the define and attaches these uniform objects, so one update per frame reaches every material). The fetch is
 * per vertex — cloud shadows are tens to hundreds of metres across, a texel 23 m — so a fragment pays one varying:
 *
 *   shadowmap_pars_vertex   CLOUD_SHADE_PARS_GLSL and `varying float vCotCloudSun`
 *   shadowmap_vertex        vCotCloudSun = cotCloudSun( worldPosition.xyz )
 *   lights_fragment_begin   each sun cascade's light × vCotCloudSun before its shadow (both CSM paths)
 *   lights_fragment_end     cotSunVis × vCotCloudSun (the scene alpha, the contact shadows' sun share, the ambient dim)
 *
 * all under `COT_CLOUD_SHADE && USE_SHADOWMAP`. Phones never take the define (their tier has no volumetric layer). A
 * program that would pass sixteen samplers with the map (three counts the program's units against the fragment
 * limit) takes `#undef COT_CLOUD_SHADE` instead (lighting.ts cloudShadeSamplerCount); a material can opt out with
 * `material.userData.cotCloudShade = false` and write the varying itself.
 */
import * as THREE from 'three';

/** A material whose program would pass this many samplers with the map keeps no cloud shade (three's fragment limit). */
export const CLOUD_SHADE_SAMPLER_BUDGET = 16;
/** The sun's elevation sine over which the shade fades in (a grazing sun's ray reaches the base kilometres away). */
export const CLOUD_SHADE_SUN_FADE: readonly [number, number] = Object.freeze([0.03, 0.08]) as readonly [number, number];
/** The share of the square's half side over which the shade fades out at its edge. */
export const CLOUD_SHADE_EDGE_FADE = 0.84;

/** The map's sampler and the two vectors every cloud-shaded material reads. */
export interface CloudShadeUniforms {
  /** R: the share of the sun a cloud takes (0 .. CLOUD_SHADOW_CORE). */
  tCotCloudShade: THREE.IUniform<THREE.Texture | null>;
  /** xy the square's centre (world xz at the cloud base, m), z 1 / its side (1/m), w on (0 / 1). */
  uCotCloudShade: THREE.IUniform<THREE.Vector4>;
  /** xyz the unit direction toward the sun, w the cloud base's altitude (m). */
  uCotCloudSun: THREE.IUniform<THREE.Vector4>;
}

export function createCloudShadeUniforms(): CloudShadeUniforms {
  return {
    tCotCloudShade: { value: null },
    uCotCloudShade: { value: new THREE.Vector4(0, 0, 1 / 12000, 0) },
    uCotCloudSun: { value: new THREE.Vector4(0, 1, 0, 1400) },
  };
}

/** Bind the shared uniform objects into a material's compiled uniforms (by reference: one update reaches them all). */
export function attachCloudShadeUniforms(shader: { uniforms: Record<string, THREE.IUniform> }, u: CloudShadeUniforms): void {
  shader.uniforms.tCotCloudShade = u.tCotCloudShade;
  shader.uniforms.uCotCloudShade = u.uCotCloudShade;
  shader.uniforms.uCotCloudSun = u.uCotCloudSun;
}

/** What the volumetric layer publishes when it refreshes the map. */
export interface CloudShadeSource {
  texture: THREE.Texture;
  /** the square: centre x, centre z, side (m) */
  rect: THREE.Vector3;
  /** the cloud base the shade was cut at (m) */
  baseM: number;
}

/** Point the uniforms at a refreshed map (or turn them off with null). */
export function publishCloudShade(u: CloudShadeUniforms, source: CloudShadeSource | null, sunDir: THREE.Vector3): void {
  if (!source) { u.uCotCloudShade.value.w = 0; return; }
  u.tCotCloudShade.value = source.texture;
  u.uCotCloudShade.value.set(source.rect.x, source.rect.y, 1 / Math.max(source.rect.z, 1), 1);
  u.uCotCloudSun.value.set(sunDir.x, sunDir.y, sunDir.z, source.baseM);
}

const f = (x: number): string => (Number.isInteger(x) ? x.toFixed(1) : String(x));

/** The declarations and the lookup (vertex stage: an explicit level, no derivatives). */
export const CLOUD_SHADE_PARS_GLSL = /* glsl */ `
uniform sampler2D tCotCloudShade;
uniform vec4 uCotCloudShade;
uniform vec4 uCotCloudSun;
// the share of the sun a world point keeps under the clouds (cloudShadeMap.ts): the point projected up the sun's ray to
// the cloud base, the undithered shade there; 1 with the map off, a grazing sun or outside the square
float cotCloudSun( vec3 wp ) {
	if ( uCotCloudShade.w < 0.5 || uCotCloudSun.y < ${f(CLOUD_SHADE_SUN_FADE[0])} ) return 1.0;
	vec2 p = wp.xz + uCotCloudSun.xz * ( ( uCotCloudSun.w - wp.y ) / uCotCloudSun.y );
	vec2 uv = ( p - uCotCloudShade.xy ) * uCotCloudShade.z + 0.5;
	float edge = max( abs( uv.x - 0.5 ), abs( uv.y - 0.5 ) ) * 2.0;
	if ( edge >= 1.0 ) return 1.0;
	float shade = textureLod( tCotCloudShade, uv, 0.0 ).r;
	return 1.0 - shade * ( 1.0 - smoothstep( ${f(CLOUD_SHADE_EDGE_FADE)}, 1.0, edge ) )
		* smoothstep( ${f(CLOUD_SHADE_SUN_FADE[0])}, ${f(CLOUD_SHADE_SUN_FADE[1])}, uCotCloudSun.y );
}
`;

/** The CPU twin of `cotCloudSun` (the receipt pins the two against each other); `shadeAt(u, v)` reads the map. */
export function cloudSunShareAt(
  wp: { x: number; y: number; z: number }, rect: { x: number; y: number; z: number }, baseM: number,
  sun: { x: number; y: number; z: number }, shadeAt: (u: number, v: number) => number,
): number {
  if (sun.y < CLOUD_SHADE_SUN_FADE[0]) return 1;
  const px = wp.x + sun.x * ((baseM - wp.y) / sun.y), pz = wp.z + sun.z * ((baseM - wp.y) / sun.y);
  const u = (px - rect.x) / rect.z + 0.5, v = (pz - rect.y) / rect.z + 0.5;
  const edge = Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)) * 2;
  if (edge >= 1) return 1;
  const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  return 1 - shadeAt(u, v) * (1 - smooth(CLOUD_SHADE_EDGE_FADE, 1, edge)) * smooth(CLOUD_SHADE_SUN_FADE[0], CLOUD_SHADE_SUN_FADE[1], sun.y);
}

const SAMPLER_DECL = /uniform\s+(?:(?:lowp|mediump|highp)\s+)?(?:sampler2D|sampler3D|samplerCube|sampler2DArray|sampler2DShadow|usampler2D|isampler2D)\s+([^;]+);/g;
const STANDARD_MAPS = Object.freeze([
  'map', 'alphaMap', 'aoMap', 'bumpMap', 'normalMap', 'displacementMap', 'emissiveMap', 'lightMap', 'metalnessMap',
  'roughnessMap', 'specularMap', 'gradientMap', 'matcap', 'envMap', 'clearcoatMap', 'clearcoatNormalMap',
  'clearcoatRoughnessMap', 'sheenColorMap', 'sheenRoughnessMap', 'transmissionMap', 'thicknessMap', 'iridescenceMap',
  'iridescenceThicknessMap', 'anisotropyMap', 'specularIntensityMap', 'specularColorMap',
] as const);

/**
 * The samplers a CSM material's program declares before the map: its own (the `uniform sampler*` lines its patches
 * write into the shader), its standard maps, the scene environment a standard material takes without its own, and the
 * cascades' shadow maps. A declaration named after a standard map is skipped: three's physical fragment writes five of
 * them inline under their #ifdefs (specularColorMap, specularIntensityMap, sheenColorMap, sheenRoughnessMap,
 * anisotropyMap) and an unused one costs no unit — a set one is counted once, through the material's own property
 * (the ground lane's lab: counted, they put the terrain at nineteen and took its cloud shade away).
 */
export function cloudShadeSamplerCount(
  shader: { vertexShader: string; fragmentShader: string }, material: object, cascades: number, sceneEnvironment: boolean,
): number {
  let n = 0;
  const standard = new Set<string>(STANDARD_MAPS);
  for (const src of [shader.vertexShader, shader.fragmentShader]) {
    for (const m of src.matchAll(SAMPLER_DECL)) {
      for (const name of m[1].split(',')) { const id = name.trim(); if (id && !standard.has(id)) n++; }
    }
  }
  const mat = material as Record<string, unknown> & { isMeshStandardMaterial?: boolean };
  for (const key of STANDARD_MAPS) if ((mat[key] as { isTexture?: boolean } | null | undefined)?.isTexture) n++;
  if (sceneEnvironment && !mat.envMap && mat.isMeshStandardMaterial) n++;
  return n + cascades;
}
