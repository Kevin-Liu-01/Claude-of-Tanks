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
import { getLocalizedMapName, isMapId } from '../world/maps/catalog.ts';
import { mapBackdropFor, type ViewportSample } from './mapBackdrop.ts';

interface FeaturedShot {
  readonly img: string;
  readonly bootImg?: string;
  readonly capKey: string;
  readonly capVars?: Readonly<Record<string, string | number>>;
  readonly maps?: readonly string[];
  readonly focal: string;
  readonly handmade?: boolean;
  readonly animated?: boolean;
}

export const FEATURED_SHOTS: readonly FeaturedShot[] = Object.freeze([
  {
    img: '/media/site50-r14/stills/s21-fields-assault-close.webp',
    bootImg: '/media/site50-r14/stills/s21-fields-assault-boot.webp',
    capKey: 'media.site50.title.s21FieldsAssault',
    maps: ['verdant'], focal: '52% 62%',
  },
  {
    img: '/media/site50-r14/stills/s07-lake-shellfire.webp',
    capKey: 'media.site50.title.s07LakeShellfire',
    maps: ['alpine', 'whiteout'], focal: '55% 60%',
  },
  {
    img: '/media/site50-r14/stills/s19-roof-tiles-close.webp',
    capKey: 'media.site50.title.s19RoofTiles',
    maps: ['urban', 'ruinspires'], focal: '50% 55%',
  },
  {
    img: '/media/site50-r14/stills/s29-fjord-road-kill.webp',
    capKey: 'media.site50.title.s29FjordRoadKill',
    maps: ['fjord', 'saltwind', 'coastal'], focal: '50% 55%',
  },
  {
    img: '/media/site50-r14/stills/s13-farm-race.webp',
    capKey: 'media.site50.title.s13FarmRace',
    maps: ['frontier', 'steppe', 'longleaf'], focal: '58% 55%',
  },
  {
    img: '/media/site50-r14/stills/s26-minaret-fire.webp',
    capKey: 'media.site50.title.s26MinaretFire',
    maps: ['oasis', 'desert', 'badlands', 'copper_mesa'], focal: '50% 50%',
  },
  {
    img: '/media/site50-r14/stills/s05-barn-advance-close.webp',
    capKey: 'media.site50.title.s05BarnAdvance',
    maps: ['polders'], focal: '50% 50%',
  },
  {
    img: '/media/site50-r14/stills/s30-temple-village-close.webp',
    capKey: 'media.site50.title.s30TempleVillage',
    maps: ['monsoon', 'mangrove'], focal: '45% 55%',
  },
  {
    img: '/media/site50-r14/stills/s33-water-tower-close.webp',
    capKey: 'media.site50.title.s33WaterTower',
    maps: ['railyard', 'airfield'], focal: '50% 55%',
  },
  {
    img: '/media/site50-r14/stills/s34-furnace-salvo-4k.webp',
    capKey: 'media.site50.title.s34FurnaceSalvo',
    maps: ['foundry', 'caldera', 'blackglass'], focal: '50% 50%',
  },
  {
    img: '/media/site50-r14/stills/s38-church-knockout-close.webp',
    capKey: 'media.site50.title.s38ChurchKnockout',
    maps: ['winter'], focal: '50% 50%',
  },
  {
    img: '/media/site50-r14/stills/s49-orchard-sunset.webp',
    capKey: 'media.site50.title.s49OrchardSunset',
    maps: ['orchard', 'autumn'], focal: '50% 62%',
  },
  {
    img: '/media/site50-r14/stills/s37-river-village-close.webp',
    capKey: 'media.site50.title.s37RiverVillage',
    maps: ['delta'], focal: '50% 50%',
  },
  {
    img: '/media/site50-r14/stills/s39-lakeside-village.webp',
    capKey: 'media.site50.title.s39LakesideVillage',
    maps: ['reservoir', 'cliffbridge', 'titan_gorge', 'skybridge'], focal: '50% 50%',
  },
  {
    img: '/media/site50-r14/stills/s23-village-crossroads.webp',
    capKey: 'media.site50.title.s23VillageCrossroads',
    focal: '50% 50%',
  },
  {
    img: '/media/site50-r14/stills/s06-farm-charge.webp',
    capKey: 'media.site50.title.s06FarmCharge',
    focal: '50% 50%',
  },
  {
    img: '/media/site50-r14/stills/s24-ice-duel-close.webp',
    capKey: 'media.site50.title.s24IceDuel',
    focal: '50% 50%',
  },
  {
    img: '/media/site50-r14/stills/s04-column-under-fire.webp',
    capKey: 'media.site50.title.s04ColumnUnderFire',
    focal: '50% 50%',
  },
  {
    img: '/media/site50-r14/stills/s20-road-return-fire-close.webp',
    capKey: 'media.site50.title.s20RoadReturnFire',
    focal: '50% 50%',
  },
  {
    img: '/media/site50-r14/stills/s18-street-knockout.webp',
    capKey: 'media.site50.title.s18StreetKnockout',
    focal: '50% 50%',
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
 * Current overview for a battlefield. The first match is intentional and
 * stable so a loading screen does not change art when network setup restages
 * the same operation. With a viewport the image tier follows it (mapBackdrop.ts);
 * without one it is the native 4K hero.
 * @param {string} mapId
 */
export function featuredShotForMap(mapId: string, viewport: ViewportSample | null = null): FeaturedShot {
  const key = String(mapId || '').trim().toLowerCase();
  // Reuse the packaged map art; publishing a new capture updates every surface.
  if (isMapId(key)) {
    return {
      img: mapBackdropFor(key, viewport), capKey: 'garage.featuredShot.battlefieldOverview',
      capVars: { name: getLocalizedMapName(key) },
      maps: [key], focal: '50% 50%',
    };
  }
  return nextFeaturedShot();
}
