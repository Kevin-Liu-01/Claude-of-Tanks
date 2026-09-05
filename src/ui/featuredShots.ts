/**
 * featuredShots.ts — the ONE canonical list of featured stills.
 *
 * Consumed by the boot splash (bootScreen.ts), the garage battle gallery
 * (garage.ts) and the state-transition loading screens (transition.ts).
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
    img: '/media/showcase-r2/29_battle_sirocco.webp',
    cap: 'Sirocco Wadi — wadi gauntlet',
    maps: ['desert', 'badlands', 'titan_gorge', 'skybridge'], focal: '50% 50%', handmade: true,
  },
  {
    img: '/media/showcase-r2/30_battle_frosthollow.webp',
    cap: 'Frosthollow — ice breaker',
    maps: ['winter', 'alpine'], focal: '50% 52%', handmade: true,
  },
  {
    img: '/media/showcase-r2/31_battle_steinburg.webp',
    cap: 'Steinburg — alley flash',
    maps: ['urban', 'caldera', 'ruinspires', 'blackglass'], focal: '50% 50%', handmade: true,
  },
  {
    img: '/media/showcase-r2/32_battle_verdant.webp',
    cap: 'Verdant Fields — column engagement',
    maps: ['verdant'], focal: '50% 50%', handmade: true,
  },
  {
    img: '/media/showcase-r2/33_battle_saltmere.webp',
    cap: 'Saltmere Bay — harbor kill',
    maps: ['coastal'], focal: '50% 52%', handmade: true,
  },
  {
    img: '/media/showcase-r2/34_battle_amberford.webp',
    cap: 'Amberford — gold inferno',
    maps: ['autumn'], focal: '50% 52%', handmade: true,
  },
  {
    img: '/media/showcase-r2/35_battle_tarkhan.webp',
    cap: 'Tarkhan Steppe — horizon charge',
    maps: ['steppe'], focal: '50% 50%', handmade: true,
  },
  {
    img: '/media/showcase-r2/36_battle_cinder.webp',
    cap: 'Cinder Junction — sodium dusk',
    maps: ['railyard'], focal: '52% 50%', handmade: true,
  },
  {
    img: '/media/showcase-r2/37_battle_frontier.webp',
    cap: 'Frontier Basin — armored contact',
    maps: ['frontier'], focal: '45% 50%', handmade: true,
  },
  {
    img: '/media/showcase-r2/38_battle_nordhavn.webp',
    cap: 'Nordhavn Fjord — armored contact',
    maps: ['fjord'], focal: '50% 48%', handmade: true,
  },
  {
    img: '/media/showcase-r2/39_battle_jade_delta.webp',
    cap: 'Jade River Delta — armored contact',
    maps: ['delta', 'monsoon'], focal: '52% 50%', handmade: true,
  },
  {
    img: '/media/showcase-r2/40_battle_urban_hero.webp',
    cap: 'Steinburg — breakthrough',
    maps: ['foundry'], focal: '55% 50%', handmade: true,
  },
  { img: '/media/showcase-r2/17_live_player_hud.webp', cap: 'Production battle HUD', focal: '50% 50%' },
  { img: '/media/showcase-r2/19_live_sniper.webp', cap: 'Precision sight', focal: '50% 50%' },
  { img: '/media/showcase-r2/20_live_gunnery.webp', cap: 'Live firing cycle', focal: '50% 50%' },
  { img: '/media/showcase-r2/21_live_destruction.webp', cap: 'Vehicle destruction', focal: '50% 50%' },
  { img: '/media/showcase-r2/22_live_detrack.webp', cap: 'Track destruction', focal: '50% 50%' },
  { img: '/media/showcase-r2/25_live_killcam_xray.webp', cap: 'Resolved-shot X-ray', focal: '50% 50%' },
  { img: '/media/showcase-r2/26_vehicle_abrams.webp', cap: 'M1A2 Abrams detail', focal: '50% 50%' },
  { img: '/media/showcase-r2/28_vehicle_leopard.webp', cap: 'Leopard 2A7V detail', focal: '50% 50%' },
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
