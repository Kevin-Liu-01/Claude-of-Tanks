// Round 35 (owner 2026-09-21: "fix our camos completely: the look of identical camos looks completely different if
// you switch between tanks. this system is busted").
//
// One camouflage pattern is ONE texture tile that must cover the same world metres on every hull, fitting and picker
// swatch. Before this round each hull projected the shared tile with its own authored `visual.camoScale` as the
// box-UV density (repeats per metre), so the same pattern spanned 2.94 m on a default hull and 1.14 m on a 0.88 hull —
// blotches differed up to 2.6x between vehicles wearing the same paint. The hull UV density is now this one constant;
// `camoScale` is a property of the PATTERN recipe (how dense it was authored) and only drives patch geometry inside
// the painter (`camoPatchWorldScale`). No Three.js, DOM or fleet import: the painter, the factory and the swatch all
// cite this module.

/** Box-UV density of every camo-painted hull, turret, gun and fitting surface: repeats per metre. */
export const CAMO_UV_REPEATS_PER_M = 0.5;

/** World metres one repeat of the camouflage tile spans on a hull (2 m). */
export const CAMO_TILE_SPAN_M = 1 / CAMO_UV_REPEATS_PER_M;

/**
 * Patch-geometry factor for a recipe density. The painter's shapes are authored against the reference density
 * (patches sized for a 2 m tile); a denser recipe (camoScale above the reference) paints proportionally smaller
 * patches, so the hand-tuned 0.55-0.72 fleet recipes keep the look they had when their hulls projected them denser.
 * Recipes at or below the reference (and recipes without a density) paint reference-size patches.
 */
export function camoPatchWorldScale(camoScale: number | null | undefined): number {
  const density = typeof camoScale === 'number' && Number.isFinite(camoScale) && camoScale > 0
    ? camoScale : CAMO_UV_REPEATS_PER_M;
  return Math.min(1, CAMO_UV_REPEATS_PER_M / density);
}
