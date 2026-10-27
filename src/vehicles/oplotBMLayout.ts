// The T-84BM Oplot-M / Oplot-T datums shared by their spec rows (ukraine.ts) and their build
// (profiles/oplotBM.ts): the turret ring, trunnion and barrel, and the gameplay ERA sectors. Pure data, boot-light.
// First-party: Kevin B. Liu (NOTICE.md).

/** Ring (hull frame), trunnion (turret frame) and barrel datums; the muzzle stands at hull z 6.18 (9.72 m overall). */
export const OPLOT_BM_FRAME = Object.freeze({
  turret: Object.freeze([0, 1.47, 0.19] as const),
  gun: Object.freeze([0, 0.295, 1.30] as const),
  barrelM: 4.69,
  barrelR: 0.112,
  boreR: 0.0625,
});

/** One seed plate per sector in the spec; the combat anatomy replaces each with its cassette lids. */
export const OPLOT_BM_ERA = Object.freeze({
  turretL: 'oplot_bm_turret_era_L', turretR: 'oplot_bm_turret_era_R',
  flankL: 'oplot_bm_flank_era_L', flankR: 'oplot_bm_flank_era_R',
  glacis: 'oplot_bm_glacis_era',
  skirtL: 'oplot_bm_skirt_era_L', skirtR: 'oplot_bm_skirt_era_R',
});
