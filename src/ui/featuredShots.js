/**
 * featuredShots.js — the ONE canonical list of featured stills.
 *
 * Consumed by the boot splash (bootScreen.js), the garage battle gallery
 * (garage.js) and the state-transition loading screens (transition.js).
 * It exists because three hand-maintained copies of these filenames drifted
 * from disk twice (r9.1: preload() errored forever and every rotation stuck
 * on frame 1). Names must match public/media/featured/ EXACTLY.
 *
 * f6-f9 are OWNER-AUTHORED studio captures. `maps` is deliberately curated,
 * not inferred from the caption: loading screens use it to keep the action
 * photography relevant to the battlefield being prepared. `focal` is a CSS
 * background-position and protects the important action when a screen crops.
 */
export const FEATURED_SHOTS = [
  {
    img: '/media/featured/f1_09_winter_lake_duel.webp',
    cap: 'Frosthollow — ammo-rack kill', maps: ['winter'], focal: '50% 44%',
  },
  {
    img: '/media/featured/f2_06_desert_hero_kf51.webp',
    cap: 'Sirocco Wadi — KF51 firing', maps: ['desert'], focal: '55% 48%',
  },
  {
    img: '/media/featured/f3_19_urban_overwatch_church.webp',
    cap: 'Steinburg — church overwatch', maps: ['urban'], focal: '50% 48%',
  },
  {
    img: '/media/featured/f4_20_urban_ruin_brawl.webp',
    cap: 'Steinburg — ruin brawl', maps: ['foundry', 'railyard', 'caldera'], focal: '50% 48%',
  },
  {
    img: '/media/featured/f5_01_desert_duel_leclerc_kill.webp',
    cap: 'Sirocco Wadi — Leclerc duel', maps: ['badlands', 'autumn'], focal: '48% 48%',
  },
  {
    img: '/media/featured/f6_studio_strv_steinburg_duel.webp',
    cap: 'Steinburg — Strv 103 street duel', maps: ['urban'], focal: '54% 48%',
  },
  {
    img: '/media/featured/f7_studio_t90_column_fire.webp',
    cap: 'Verdant Fields — T-90 column under fire', maps: ['verdant', 'frontier'], focal: '50% 48%',
  },
  {
    img: '/media/featured/f8_studio_m1_firefight.webp',
    cap: 'Verdant Fields — M1 platoon firefight', maps: ['steppe', 'delta', 'monsoon', 'coastal'], focal: '50% 48%',
  },
  {
    img: '/media/featured/f9_studio_fjord_firefight.webp',
    cap: 'Glacier Fjord — armored breakthrough', maps: ['fjord', 'alpine'], focal: '52% 48%',
  },
];

/** Just the image URLs (boot hero + transition backdrops). */
export const FEATURED_IMAGES = FEATURED_SHOTS.map((s) => s.img);

/** A random featured-shot record. */
export function randomFeaturedShot() {
  return FEATURED_SHOTS[Math.floor(Math.random() * FEATURED_SHOTS.length)];
}

/**
 * Best action still for a battlefield. The first match is intentional and
 * stable so a loading screen does not change art when network setup restages
 * the same operation.
 * @param {string} mapId
 */
export function featuredShotForMap(mapId) {
  const key = String(mapId || '').trim().toLowerCase();
  return FEATURED_SHOTS.find((shot) => shot.maps?.includes(key)) || randomFeaturedShot();
}

/** A random featured image URL. @returns {string} */
export function randomFeaturedImage() {
  return randomFeaturedShot().img;
}
