export const SHADOW_NORMAL_BIAS_MIN_M = 0.045;
export const SHADOW_NORMAL_BIAS_MAX_M = 0.28;
const SHADOW_NORMAL_BIAS_TEXELS = 0.35;
/**
 * Daylight cast-shadow strength. The 1049e4e presentation the owner prefers
 * used Three's full-strength cascades: the sun is fully occluded inside a cast
 * shadow, while the hemisphere/fill lights and the ambient shadow dim in
 * lighting.ts keep receiver texture readable. The later 0.52 setting left
 * 48% of the key light inside every shadow and flattened terrain, tanks,
 * trees and buildings into an ambient wash.
 */
export const SHADOW_OPACITY = 1.0;

/** Snap one light-space coordinate to a shadow-map texel. */
export function snapShadowCoordinate(coordinate: number, worldUnitsPerTexel: number): number {
  if (!Number.isFinite(coordinate)) return 0;
  if (!(worldUnitsPerTexel > 0) || !Number.isFinite(worldUnitsPerTexel)) return coordinate;
  return Math.floor(coordinate / worldUnitsPerTexel) * worldUnitsPerTexel;
}

/**
 * Scale receiver normal bias with a cascade's physical texel footprint.
 *
 * One fixed world-space bias cannot serve both a centimeter-scale contact map
 * and a meter-scale horizon map: it either detaches near shadows or leaves far
 * terrain/tree receivers covered in precision acne. The bounded texel ratio
 * keeps the near look unchanged while giving each broader cascade enough
 * separation to remain stable on slopes and overlapping vegetation.
 */
export function shadowNormalBiasForTexel(worldUnitsPerTexel: number): number {
  const scaled = Number.isFinite(worldUnitsPerTexel)
    ? worldUnitsPerTexel * SHADOW_NORMAL_BIAS_TEXELS
    : SHADOW_NORMAL_BIAS_MIN_M;
  return Math.min(SHADOW_NORMAL_BIAS_MAX_M,
    Math.max(SHADOW_NORMAL_BIAS_MIN_M, scaled));
}

/**
 * The cascades' depth bias, in world metres along the sun ray (2026-10-04, the scenery lane: the gauntlet's floating
 * desert rocks and Redrock's contact ring). The single normalised bias of -0.0002 over the CSM lights' 1-2000 m depth
 * range came to 0.40 m on every cascade. A ground point within 40 cm of its occluder along the sun ray stayed lit:
 * a lit seam of 0.40 x cos(elevation) at every contact, 0.33 m under a 35-degree sun, and no shadow at all under a
 * stone lower than that.
 *
 * What a cascade needs is set by the reach of its PCF filter in its own texels. A tap of the five-tap Vogel disk lands
 * up to 0.95 of the filter radius from the receiver, and the hardware 2x2 compare reads one texel beyond it. On a
 * caster face turned theta from the sun, the stored depth at that reach stands reach x sin(theta) nearer the light;
 * the receiver's normal offset and the depth bias cover it together (normalBias + bias x cos(theta) >= reach x
 * sin(theta)). Solved for a face 70 degrees from the sun (n.l 0.34; a steeper face takes little sun), floored at 2 cm
 * and capped at the old 0.40 m, so no cascade's shadow stands further from its caster than it did.
 */
export const SHADOW_DEPTH_BIAS_MIN_M = 0.02;
export const SHADOW_DEPTH_BIAS_MAX_M = 0.4;
export const SHADOW_ACNE_FREE_INCIDENCE_DEG = 70;
/** The outermost Vogel tap's radius as a share of the filter radius (sqrt(4.5 / 5), three r185's five taps). */
const PCF_TAP_REACH = 0.95;
/** The hardware compare's footprint beyond each tap, texels (a LinearFilter depth texture compares its 2x2). */
const PCF_COMPARE_TEXELS = 1;

export function shadowDepthBiasForTexel(worldUnitsPerTexel: number, filterRadiusTexels: number, normalBias: number): number {
  if (!(worldUnitsPerTexel > 0) || !Number.isFinite(worldUnitsPerTexel)) return SHADOW_DEPTH_BIAS_MAX_M;
  const reach = (PCF_TAP_REACH * Math.max(0, filterRadiusTexels) + PCF_COMPARE_TEXELS) * worldUnitsPerTexel;
  const theta = SHADOW_ACNE_FREE_INCIDENCE_DEG * Math.PI / 180;
  const needed = (reach * Math.sin(theta) - (Number.isFinite(normalBias) ? normalBias : 0)) / Math.cos(theta);
  return Math.min(SHADOW_DEPTH_BIAS_MAX_M, Math.max(SHADOW_DEPTH_BIAS_MIN_M, needed));
}

/**
 * The depth bias of a receiver-only surface, world metres along the sun ray (lighting.ts setupShadowMaterial,
 * material.userData.cotShadowReceiverOnly): a surface whose meshes never cast is in no depth map, so it needs no acne
 * margin, only a hair over the depth's own precision. It takes no receiver normal offset either.
 */
export const SHADOW_RECEIVER_ONLY_BIAS_M = 0.02;
