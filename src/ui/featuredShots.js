/**
 * featuredShots.js — the ONE canonical list of featured stills.
 *
 * Consumed by the boot splash (bootScreen.js), the garage battle gallery
 * (garage.js) and the state-transition loading screens (transition.js).
 * It exists because three hand-maintained copies of these filenames drifted
 * from disk twice (r9.1: preload() errored forever and every rotation stuck
 * on frame 1). Names must match public/media/featured/ EXACTLY.
 *
 * f6 is the first OWNER-AUTHORED studio capture (scene studio, 2026-08-01).
 */
export const FEATURED_SHOTS = [
  { img: '/media/featured/f1_09_winter_lake_duel.webp', cap: 'Frosthollow — ammo-rack kill' },
  { img: '/media/featured/f2_06_desert_hero_kf51.webp', cap: 'Sirocco Wadi — KF51 firing' },
  { img: '/media/featured/f3_19_urban_overwatch_church.webp', cap: 'Steinburg — church overwatch' },
  { img: '/media/featured/f4_20_urban_ruin_brawl.webp', cap: 'Steinburg — ruin brawl' },
  { img: '/media/featured/f5_01_desert_duel_leclerc_kill.webp', cap: 'Sirocco Wadi — Leclerc duel' },
  { img: '/media/featured/f6_studio_t90_road_ambush.webp', cap: 'Verdant Fields — T-90 road ambush' },
];

/** Just the image URLs (boot hero + transition backdrops). */
export const FEATURED_IMAGES = FEATURED_SHOTS.map((s) => s.img);

/** A random featured image URL. @returns {string} */
export function randomFeaturedImage() {
  return FEATURED_IMAGES[Math.floor(Math.random() * FEATURED_IMAGES.length)];
}
