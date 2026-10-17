/**
 * shadowCascadeFade.ts — the cascades' fade law, in one place (2026-10-14, SKY shadows r2a; the shadow-quality plan's C6).
 *
 * three's CSM blends a fragment between two cascades over a band around each break. Its band was 0.25·x² of the
 * normalised depth (x a break's share of the shadow range): half-bands of 0.4-1.4 m at the near breaks, where the texel
 * jumps 2-3.5x across the seam, and the shadow box was widened for it against the camera's 4 km far plane while the
 * shader measured the 700 m shadow range — so fragments inside the band could fall outside the box and read lit. The
 * law here is linear: a half-band of CSM_FADE_HALF_SHARE of the break's distance on each side (±1.8 m at 30 m, ±5.3 m
 * at 89 m, ±19 m at 320 m), and every reader takes it from this module: the CSM shader's margin (lighting.ts), the
 * shadow boxes' widening (lighting.ts, normalised by the shadow range), the caster profiles' sampled range
 * (shadowCasterProfiles.ts) and the held cascade poses (shadowStaticCache.ts).
 *
 * Pure: no THREE, so the receipts and the Node tools run it.
 */

/** Half the fade band at a break, as a share of the break's own (normalised) distance. */
export const CSM_FADE_HALF_SHARE = 0.06;

/** Half the fade band at a normalised break x (a share of the shadow range). */
export function csmFadeHalfBand(x: number): number {
  return CSM_FADE_HALF_SHARE * Math.max(0, x);
}

/** The view depth (m) from which a cascade whose slice starts at normalised `from` is sampled. */
export function csmSliceFromM(from: number, near: number, far: number, fade: boolean): number {
  const x = Math.max(0, from);
  return (fade ? x - csmFadeHalfBand(x) : x) * Math.max(0, far - near);
}

/** The view depth (m) to which a cascade whose slice ends at normalised `to` is sampled. */
export function csmSliceToM(to: number, near: number, far: number, fade: boolean): number {
  const x = Math.max(0, to);
  return (fade ? x + csmFadeHalfBand(x) : x) * Math.max(0, far - near);
}

/**
 * The shadow box's widening (m) for a slice whose far edge stands `farEdgeM` metres from the camera: the whole fade band
 * at that edge (both halves), so every fragment the shader blends into the cascade lies inside its box.
 */
export function csmBoxFadeMarginM(farEdgeM: number): number {
  return 2 * CSM_FADE_HALF_SHARE * Math.abs(farEdgeM);
}

/** The CSM shader's margin line (the whole band at the closest edge, in normalised depth). */
export const CSM_FADE_MARGIN_GLSL = `margin = ${(2 * CSM_FADE_HALF_SHARE).toFixed(4)} * closestEdge;`;
/** The line three's CSMShader carries in its place. */
export const CSM_FADE_MARGIN_THREE = 'margin = 0.25 * pow( closestEdge, 2.0 );';

/** The contact march's reach without a published seam (contact r6's fallback, 0.15 m). */
export const CONTACT_SEAM_FALLBACK_M = 0.15;
/** The residual seam a cascade leaves at a contact (m): its depth bias along the sun and one texel. */
export function contactSeamFor(biasM: number, texelM: number): number {
  return Math.max(0, biasM) + Math.max(0, texelM);
}

/**
 * Three's 'custom' split: the preset's breaks (m) as fractions of the shadow range, monotonic and under it, the last at 1;
 * a missing break falls back to the uniform split's.
 */
export function pushCustomCascadeBreaks(splitsM: readonly number[] | null, amount: number, far: number, target: number[]): void {
  let prev = 0;
  for (let i = 1; i < amount; i++) {
    const m = splitsM?.[i - 1] ?? (far * i) / amount;
    prev = Math.min(0.999, Math.max(prev + 1e-3, m / Math.max(far, 1e-3)));
    target.push(prev);
  }
  target.push(1);
}
