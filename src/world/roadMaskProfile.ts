function smooth(a: number, b: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Construction-only low-pass for the existing road-mask texel footprint. */
export function roadCoreMask(distanceM: number, wobbleM: number, widthM: number, texelM: number): number {
  const edge = 3.85 + wobbleM + widthM;
  const feather = Math.max(0.55, texelM);
  const core = 1 - smooth(edge - feather, edge + feather, distanceM);
  // A sub-metre grass seam cannot resolve in a 2–4 m texel. Attenuate its
  // contrast instead of baking periodic white holes down a snowy road.
  const seam = 1 - smooth(0.25, 0.95, distanceM + wobbleM * 0.12);
  return core * (1 - 0.66 * Math.min(1, 0.6 / texelM) * seam);
}

/** Compute once per mask bake. Sub-metre ruts cannot resolve in 2–4m texels. */

/**
 * Sharpness (1/sigma, per metre) of the twin wheel-lane profile the shader
 * evaluates from the mask's distance field, or 0 for a coarse mask. Bilinear
 * filtering overestimates the field within half a texel of the road centre:
 * the desktop 2 m mask keeps the 1.55 m lanes outside that zone (0.42 m
 * sigma), while a 4 m mobile mask would bead any lane inside it, so the shader
 * falls back to one compaction plateau over the centre 2 m (flat across the
 * whole error zone, hence bead-free) there.
 */
export function roadLaneSharpness(maskSize: number, mapSizeM = 1024): number {
  const texelM = mapSizeM / Math.max(1, maskSize);
  return texelM <= 2.5 ? 2.4 : 0;
}
