/**
 * featuredShots.ts — the ONE canonical list of featured stills.
 *
 * Consumed by the boot splash (bootScreen.ts), the garage battle gallery
 * (garage.js) and the state-transition loading screens (transition.ts).
 * It exists because three hand-maintained copies of these filenames drifted
 * from disk twice (r9.1: preload() errored forever and every rotation stuck
 * on frame 1). URLs must match a checked-in public asset exactly.
 *
 * `FEATURED_SHOTS` remains the complete garage gallery. Loading and transition
 * surfaces use the smaller `TRANSITION_SHOTS` set so older marketing renders
 * stay browsable without returning to the player-facing loading rotation.
 */
export interface FeaturedShot {
  readonly img: string;
  readonly bootImg?: string;
  readonly cap: string;
  readonly maps?: readonly string[];
  readonly focal: string;
  readonly handmade?: boolean;
  readonly animated?: boolean;
}

export const FEATURED_SHOTS: readonly FeaturedShot[] = Object.freeze([
  {
    img: '/media/featured/f7_studio_t90_column_fire.webp',
    bootImg: '/media/featured/f7_studio_t90_column_fire.boot.webp',
    cap: 'Scene Studio — T-90 column fire',
    maps: ['verdant', 'frontier'], focal: '50% 48%', handmade: true,
  },
  {
    img: '/media/featured/f6_studio_strv_steinburg_duel.webp',
    cap: 'Scene Studio — Strv Steinburg duel',
    maps: ['urban', 'foundry', 'railyard', 'caldera', 'ruinspires', 'blackglass'],
    focal: '50% 52%', handmade: true,
  },
  {
    img: '/media/featured/f9_studio_fjord_firefight.webp',
    cap: 'Scene Studio — Fjord firefight',
    maps: ['winter', 'fjord', 'alpine'], focal: '50% 50%', handmade: true,
  },
  {
    img: '/media/featured/f8_studio_m1_firefight.webp',
    cap: 'Scene Studio — M1 firefight', focal: '50% 50%', handmade: true,
  },
  {
    img: '/media/featured/f10_studio_urban_crossfire.webp',
    cap: 'Scene Studio — urban crossfire', focal: '50% 50%', handmade: true,
  },
  {
    img: '/media/presentation-r1/12_urban_crossfire_x.webp',
    cap: 'Steinburg — crossfire X',
    maps: ['urban', 'foundry', 'railyard', 'caldera'], focal: '50% 52%',
  },
  {
    img: '/media/presentation-r1/02_desert_rooftop_dive.webp',
    cap: 'Sirocco Wadi — rooftop dive',
    maps: ['desert', 'badlands', 'delta', 'monsoon', 'titan_gorge', 'skybridge'],
    focal: '50% 50%',
  },
  {
    img: '/media/presentation-r1/03_desert_muzzle_worm.webp',
    cap: 'Sirocco Wadi — muzzle worm', focal: '50% 50%',
  },
  {
    img: '/media/presentation-r1/05_winter_ice_breaker.webp',
    cap: 'Frosthollow — ice breaker', focal: '50% 52%',
  },
  {
    img: '/media/presentation-r1/08_winter_village_hell.webp',
    cap: 'Frosthollow — village hell', maps: ['winter', 'fjord', 'alpine'], focal: '50% 50%',
  },
  {
    img: '/media/presentation-r1/10_urban_overpass_dive.webp',
    cap: 'Steinburg — overpass dive', focal: '50% 52%',
  },
  {
    img: '/media/presentation-r1/15_verdant_column_massacre.webp',
    cap: 'Verdant Fields — column massacre', maps: ['verdant', 'frontier'], focal: '50% 50%',
  },
  {
    img: '/media/presentation-r1/16_verdant_meadow_duel.webp',
    cap: 'Verdant Fields — meadow duel', maps: ['coastal'], focal: '50% 50%',
  },
  {
    img: '/media/presentation-r1/23_autumn_gold_inferno.webp',
    cap: 'Amberford — gold inferno', focal: '50% 52%',
  },
  {
    img: '/media/presentation-r1/24_autumn_orchard_stand.webp',
    cap: 'Amberford — orchard stand', maps: ['autumn'], focal: '50% 50%',
  },
  {
    img: '/media/presentation-r1/25_steppe_horizon_charge.webp',
    cap: 'Tarkhan Steppe — horizon charge', maps: ['steppe'], focal: '50% 50%',
  },
  {
    img: '/media/presentation-r1/32_desert_ram_abramsx_t90m.webp',
    cap: 'Sirocco Wadi — AbramsX versus T-90M', focal: '50% 52%',
  },
  {
    img: '/media/presentation-r1/33_desert_overwatch_line.webp',
    cap: 'Sirocco Wadi — overwatch line', focal: '50% 50%',
  },
  {
    img: '/media/presentation-r1/studio_action_05_5050ms.webp',
    cap: 'Scene Studio — burning advance', focal: '50% 55%',
  },
  {
    img: '/media/feature-evidence-r2/studio-action.webp',
    cap: 'Scene Studio — directed urban battle', focal: '50% 52%', handmade: true,
  },
]);

/** Just the image URLs (boot hero + transition backdrops). */
export const TRANSITION_SHOTS = FEATURED_SHOTS.filter((shot) => shot.maps?.length);
export const FEATURED_IMAGES = TRANSITION_SHOTS.map((s) => s.img);

let rotation: FeaturedShot[] = [];
let previousImage = '';

function refillRotation(): void {
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
export function nextFeaturedShot(): FeaturedShot {
  if (!rotation.length) refillRotation();
  const shot = rotation.shift();
  if (!shot) throw new Error('No transition shots are configured');
  previousImage = shot.img;
  return shot;
}

/** Backward-compatible random-shot name; now uses the non-repeating rotation. */
export function randomFeaturedShot(): FeaturedShot {
  return nextFeaturedShot();
}

/**
 * Best action still for a battlefield. The first match is intentional and
 * stable so a loading screen does not change art when network setup restages
 * the same operation.
 * @param {string} mapId
 */
export function featuredShotForMap(mapId: string): FeaturedShot {
  const key = String(mapId || '').trim().toLowerCase();
  return TRANSITION_SHOTS.find((shot) => shot.maps?.includes(key)) || nextFeaturedShot();
}
