/**
 * shadowCascadeLayout.ts — 2026-10-09 (the shadows lane, overhaul round r2; the owner: "also completely overhaul and improve
 * the shadow system").
 *
 * Where the cascades split and how wide their seams fade. Three's CSM in `practical` mode (λ 0.5) put the High tier's
 * nearest cascade over 0–89 m of its 700 m range: a 213 m box on a 2048 map, 10.4 cm a texel, ten times coarser than a
 * screen pixel at 10 m, where the chase camera holds the player's own hull. A track, a road wheel or a fence post spanned a
 * handful of texels, and the five-tap PCF read the edge as a soft blob or a stair-step. Every box below was measured with
 * three's own split and bounds law (`.qa-dev/cascade-layout.mjs`).
 *
 * The explicit breaks of a preset (quality.ts `shadowBreaksM`, metres from the camera) put the first cascade over the
 * ground the chase camera looks down on. High and Ultra's 28 / 110 / 320 m over 700 m give boxes of 69 / 270 / 790 /
 * 1649 m:
 *
 * | distance from the camera | High's texel today | High with the breaks |
 * |---|---|---|
 * | 0–28 m | 10.4 cm | 3.4 cm |
 * | 28–89 m | 10.4 cm | 13.2 cm |
 * | 89–110 m | 21.8 cm | 13.2 cm |
 * | 110–184 m | 21.8 cm | 38.6 cm |
 * | 184–700 m | unchanged | unchanged |
 *
 * Ultra halves every one of those. Four cascades over 700 m cannot add a near band without taking one from the middle;
 * a fifth would put the terrain program over its sixteen texture units (textureUnits.selftest).
 *
 * The seams. Three fades a cascade into the next over a margin of 0.25·x² of the range at a break x (a fraction of the
 * shadow range): 2.8 m at today's 89 m break, but only 0.3 m at 28 m, a hard line where a 3.4 cm map hands over to a
 * 13 cm one. With explicit breaks the margin is max(0.25·x², min(k·x, CSM_FADE_CAP)), k = CSM_FADE_K: a seam fades over
 * k of its own distance near the camera (4.2 m at 28 m, 16.5 m at 110 m), capped at CSM_FADE_CAP of the range, and keeps
 * three's law where that is wider (the 320 m seam: three's 36.6 m). A preset without breaks takes k 0: three's law exactly,
 * so those tiers render as they did. The law is patched into three's CSM fragment chunk with k as a shared uniform
 * (lighting.ts uCotCsmFadeK); each cascade's box grows by the margin the law adds over three's (three's own bounds code is
 * kept for the rest, the last cascade untouched); and the caster profiles sample by it (shadowCasterProfiles.ts
 * csmSampledFromM). The last cascade's fade-out edge (x = 1) keeps three's 0.25. No DOM, no WebGL, no three: the receipt
 * runs it as it is.
 */

/** Share of a seam's own distance (a fraction of the shadow range) over which the cascades blend, with explicit breaks. */
export const CSM_FADE_K = 0.15;
/** The widest margin the share gives (a fraction of the shadow range: 21 m of High's 700 m). */
export const CSM_FADE_CAP = 0.03;

/** The share a preset's seams fade over: CSM_FADE_K with explicit breaks, 0 (three's law) without. */
export function csmFadeKFor(breaksM: readonly number[] | null | undefined): number {
  return breaksM && breaksM.length ? CSM_FADE_K : 0;
}

/** The fade margin at a break `x` (a fraction of the shadow range), in the same units; k 0 is three's 0.25·x². */
export function csmFadeMargin(x: number, k = CSM_FADE_K): number {
  const b = Math.max(0, x);
  return Math.max(0.25 * b * b, Math.min(Math.max(0, k) * b, CSM_FADE_CAP));
}

/** Three's practical split (λ 0.5): the breaks of a preset that names none. */
function practicalBreaks(cascades: number, near: number, far: number, target: number[]): void {
  for (let i = 1; i < cascades; i++) {
    const log = near * (far / near) ** (i / cascades);
    const uniform = near + (far - near) * i / cascades;
    target.push((0.5 * uniform + 0.5 * log) / far);
  }
  target.push(1);
}

/**
 * Fill `target` with the normalised breaks (fractions of `far`, the last 1) for `cascades` cascades: the preset's explicit
 * breaks in metres when they are usable — one fewer than the cascades, ascending, between the near plane and the far
 * range — else three's practical split. The CSM `custom` split callback.
 */
export function cascadeBreaks(
  target: number[], cascades: number, near: number, far: number, breaksM?: readonly number[] | null,
): number[] {
  target.length = 0;
  const n = Math.max(1, cascades | 0);
  const usable = !!breaksM && breaksM.length === n - 1 && breaksM.every((b, i) => Number.isFinite(b) && b > near
    && b < far && (i === 0 || b > breaksM[i - 1]));
  if (!usable) { practicalBreaks(n, near, far, target); return target; }
  for (const b of breaksM!) target.push(b / far);
  target.push(1);
  return target;
}

/** The GLSL expression of the margin law, for three's CSM fragment chunk (`closestEdge` and `uCotCsmFadeK` in scope). */
export const CSM_FADE_MARGIN_GLSL = `max( 0.25 * pow( closestEdge, 2.0 ), min( uCotCsmFadeK * closestEdge, ${CSM_FADE_CAP.toFixed(4)} ) )`;
