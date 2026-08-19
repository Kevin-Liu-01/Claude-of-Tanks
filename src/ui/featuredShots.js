/**
 * featuredShots.js — the ONE canonical list of featured stills.
 *
 * Consumed by the boot splash (bootScreen.js), the garage battle gallery
 * (garage.js) and the state-transition loading screens (transition.js).
 * It exists because three hand-maintained copies of these filenames drifted
 * from disk twice (r9.1: preload() errored forever and every rotation stuck
 * on frame 1). Names must match public/media/featured/ EXACTLY.
 *
 * `FEATURED_SHOTS` remains the complete garage gallery. Loading and transition
 * surfaces use the smaller `TRANSITION_SHOTS` set so older marketing renders
 * stay browsable without returning to the player-facing loading rotation.
 */
export const FEATURED_SHOTS = [
  {
    img: '/media/featured/f1_09_winter_lake_duel.webp',
    cap: 'Frosthollow — ammo-rack kill', focal: '50% 44%',
  },
  {
    img: '/media/featured/f2_06_desert_hero_kf51.webp',
    cap: 'Sirocco Wadi — KF51 firing', focal: '55% 48%',
  },
  {
    img: '/media/featured/f3_19_urban_overwatch_church.webp',
    cap: 'Steinburg — church overwatch', focal: '50% 48%',
  },
  {
    img: '/media/featured/f4_20_urban_ruin_brawl.webp',
    cap: 'Steinburg — ruin brawl', focal: '50% 48%',
  },
  {
    img: '/media/featured/f5_01_desert_duel_leclerc_kill.webp',
    cap: 'Sirocco Wadi — Leclerc duel', focal: '48% 48%',
  },
  {
    img: '/media/featured/f6_studio_strv_steinburg_duel.webp',
    cap: 'Steinburg — Strv 103 street duel',
    maps: ['urban', 'foundry', 'railyard', 'caldera'], focal: '54% 48%',
  },
  {
    img: '/media/featured/f7_studio_t90_column_fire.webp',
    cap: 'Verdant Fields — T-90 column under fire',
    maps: ['verdant', 'frontier', 'steppe'], focal: '50% 48%',
  },
  {
    img: '/media/featured/f8_studio_m1_firefight.webp',
    cap: 'Verdant Fields — M1 platoon firefight',
    maps: ['desert', 'badlands', 'autumn', 'delta', 'monsoon', 'coastal'], focal: '50% 48%',
  },
  {
    img: '/media/featured/f9_studio_fjord_firefight.webp',
    cap: 'Glacier Fjord — armored breakthrough',
    maps: ['fjord', 'alpine', 'winter'], focal: '52% 48%',
  },
];

/** Just the image URLs (boot hero + transition backdrops). */
export const TRANSITION_SHOTS = FEATURED_SHOTS.filter((shot) => shot.maps?.length);
export const FEATURED_IMAGES = TRANSITION_SHOTS.map((s) => s.img);

let rotation = [];
let previousImage = '';

function refillRotation() {
  rotation = [...TRANSITION_SHOTS];
  for (let i = rotation.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rotation[i], rotation[j]] = [rotation[j], rotation[i]];
  }
  if (rotation.length > 1 && rotation[0].img === previousImage) {
    [rotation[0], rotation[1]] = [rotation[1], rotation[0]];
  }
}

/** Next curated capture, shuffled without immediate repeats. */
export function nextFeaturedShot() {
  if (!rotation.length) refillRotation();
  const shot = rotation.shift();
  previousImage = shot.img;
  return shot;
}

/** Backward-compatible random-shot name; now uses the non-repeating rotation. */
export function randomFeaturedShot() {
  return nextFeaturedShot();
}

/**
 * Best action still for a battlefield. The first match is intentional and
 * stable so a loading screen does not change art when network setup restages
 * the same operation.
 * @param {string} mapId
 */
export function featuredShotForMap(mapId) {
  const key = String(mapId || '').trim().toLowerCase();
  return TRANSITION_SHOTS.find((shot) => shot.maps?.includes(key)) || nextFeaturedShot();
}
