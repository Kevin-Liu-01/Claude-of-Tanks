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
