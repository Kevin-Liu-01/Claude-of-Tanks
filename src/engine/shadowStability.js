/** Snap one light-space coordinate to a shadow-map texel. */
export function snapShadowCoordinate(coordinate, worldUnitsPerTexel) {
  return Math.floor(coordinate / worldUnitsPerTexel) * worldUnitsPerTexel;
}
