export const SHADOW_NORMAL_BIAS_MIN_M = 0.045;
export const SHADOW_NORMAL_BIAS_MAX_M = 0.28;
export const SHADOW_NORMAL_BIAS_TEXELS = 0.35;
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
