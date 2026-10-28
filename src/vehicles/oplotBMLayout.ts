// The T-84BM Oplot-M / Oplot-T datums shared by their spec rows (ukraine.ts) and their build
// (profiles/oplotBM.ts): the turret ring, trunnion and barrel, and the gameplay ERA sectors. Pure data, boot-light.
// First-party: Kevin B. Liu (NOTICE.md).

/** The build authors every station at 4.0 times the print and bakes this one uniform factor at the end
 * (resizeAuthoredVehicle): the registered comparison scale 4.10 (tools/source-world-registration.mjs bm_oplot_m). */
export const OPLOT_BM_SCALE = 1.025;

/** Authoring-frame datums: the ring (hull frame), the trunnion (turret frame) and the print's 4.92 m barrel. The ring
 * and trunnion are the registered source datums (tools/source-world-registration.mjs bm_oplot_m: turret
 * [-0.012, 1.4965, 0.185], gun [-0.012, 1.808, 1.518], the print's ring 12 mm right of its hull centre) divided by
 * OPLOT_BM_SCALE, so the installed pivots land on them. */
export const OPLOT_BM_AUTHORING = Object.freeze({
  turret: Object.freeze([-0.0117, 1.46, 0.1805] as const),
  gun: Object.freeze([0, 0.3039, 1.3005] as const),
  barrelM: 4.92,
  barrelR: 0.112,
  boreR: 0.0625,
});

const scaled = (v: readonly number[]): [number, number, number] => [v[0] * OPLOT_BM_SCALE, v[1] * OPLOT_BM_SCALE, v[2] * OPLOT_BM_SCALE];

/** The installed (spec and combat-rig) frame: the authoring datums at the registered scale. */
export const OPLOT_BM_FRAME = Object.freeze({
  turret: Object.freeze(scaled(OPLOT_BM_AUTHORING.turret)),
  gun: Object.freeze(scaled(OPLOT_BM_AUTHORING.gun)),
  barrelM: OPLOT_BM_AUTHORING.barrelM * OPLOT_BM_SCALE,
  barrelR: OPLOT_BM_AUTHORING.barrelR * OPLOT_BM_SCALE,
});

/** One seed plate per sector in the spec; the combat anatomy replaces each with its cassette lids. */
export const OPLOT_BM_ERA = Object.freeze({
  turretL: 'oplot_bm_turret_era_L', turretR: 'oplot_bm_turret_era_R',
  flankL: 'oplot_bm_flank_era_L', flankR: 'oplot_bm_flank_era_R',
  glacis: 'oplot_bm_glacis_era',
  skirtL: 'oplot_bm_skirt_era_L', skirtR: 'oplot_bm_skirt_era_R',
});
