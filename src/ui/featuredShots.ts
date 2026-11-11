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
 * surfaces use `TRANSITION_SHOTS`: the boot pick (the gallery's one `bootImg`
 * shot), then `LOADING_SHOTS`, the stills the owner picked from his
 * loading-screen gallery (2026-11-11: its first sixteen close-ups,
 * public/media/loading-r1). Both lists are
 * written by tools/media-r5/site-media-wire.mjs from
 * tools/media-r5/site-media/picks.json (`featured`, `loading`).
 */
import { isMapId } from '../world/maps/catalog.ts';
import { getLocalizedMapName } from './mapNames.ts';
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
    img: '/media/versus-r1/f6-leo2a6-steinburg-r7.webp',
    bootImg: '/media/versus-r1/f6-leo2a6-steinburg-r7-boot-1280.webp',
    capKey: 'media.versus.title.f6Leo2a6SteinburgR7',
    maps: ['urban'], focal: '46% 60%',
  },
  {
    img: '/media/site50-r14/stills/s07-lake-shellfire.webp',
    capKey: 'media.site50.title.s07LakeShellfire',
    maps: ['alpine', 'whiteout'], focal: '55% 60%',
  },
  {
    img: '/media/site50-r14/stills/s19-roof-tiles-close.webp',
    capKey: 'media.site50.title.s19RoofTiles',
    maps: ['urban', 'ruinspires'], focal: '57% 55%',
  },
  {
    img: '/media/site50-r14/stills/s29-fjord-road-kill.webp',
    capKey: 'media.site50.title.s29FjordRoadKill',
    maps: ['fjord', 'saltwind', 'coastal'], focal: '38% 55%',
  },
  {
    img: '/media/site50-r14/stills/s13-farm-race.webp',
    capKey: 'media.site50.title.s13FarmRace',
    maps: ['frontier', 'steppe', 'longleaf'], focal: '64% 55%',
  },
  {
    img: '/media/site50-r14/stills/s26-minaret-fire.webp',
    capKey: 'media.site50.title.s26MinaretFire',
    maps: ['oasis', 'desert', 'badlands', 'copper_mesa'], focal: '50% 50%',
  },
  {
    img: '/media/site50-r14/stills/s05-barn-advance-close.webp',
    capKey: 'media.site50.title.s05BarnAdvance',
    maps: ['polders'], focal: '64% 50%',
  },
  {
    img: '/media/site50-r14/stills/s30-temple-village-close.webp',
    capKey: 'media.site50.title.s30TempleVillage',
    maps: ['monsoon', 'mangrove'], focal: '57% 55%',
  },
  {
    img: '/media/site50-r14/stills/s33-water-tower-close.webp',
    capKey: 'media.site50.title.s33WaterTower',
    maps: ['railyard', 'airfield'], focal: '50% 55%',
  },
  {
    img: '/media/site50-r14/stills/s34-furnace-salvo-4k.webp',
    capKey: 'media.site50.title.s34FurnaceSalvo',
    maps: ['foundry', 'caldera', 'blackglass'], focal: '38% 50%',
  },
  {
    img: '/media/site50-r14/stills/s38-church-knockout-close.webp',
    capKey: 'media.site50.title.s38ChurchKnockout',
    maps: ['winter'], focal: '39% 50%',
  },
  {
    img: '/media/site50-r14/stills/s49-orchard-sunset.webp',
    capKey: 'media.site50.title.s49OrchardSunset',
    maps: ['orchard', 'autumn'], focal: '78% 62%',
  },
  {
    img: '/media/site50-r14/stills/s37-river-village-close.webp',
    capKey: 'media.site50.title.s37RiverVillage',
    maps: ['delta'], focal: '26% 50%',
  },
  {
    img: '/media/site50-r14/stills/s39-lakeside-village.webp',
    capKey: 'media.site50.title.s39LakesideVillage',
    maps: ['reservoir', 'cliffbridge', 'titan_gorge', 'skybridge'], focal: '43% 50%',
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

/** The loading screens' stills after the boot pick, in the gallery's order (picks.json `loading`). */
export const LOADING_SHOTS: readonly FeaturedShot[] = Object.freeze([
  {
    img: '/media/loading-r1/s198-m1a2-tusk-copper-mesa-duel-low-t70-f33-m271-r14.webp',
    capKey: 'media.loading.title.s198M1a2TuskCopperMesaDuelLowT70F33M271R14',
    maps: ['copper_mesa'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s294-sepv3-copper-mesa-herolow-f33-m271-r14.webp',
    capKey: 'media.loading.title.s294Sepv3CopperMesaHerolowF33M271R14',
    maps: ['copper_mesa'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s298-t90ms-tagil-saltwind-herolow-v3-f33-m271-r14.webp',
    capKey: 'media.loading.title.s298T90msTagilSaltwindHerolowV3F33M271R14',
    maps: ['saltwind'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s280-leo2a3-b4-urban-duel-low-t70-f33-m271-r14.webp',
    capKey: 'media.loading.title.s280Leo2a3B4UrbanDuelLowT70F33M271R14',
    maps: ['urban'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s199-m1a2-x-desert-herolow-m271-r14.webp',
    capKey: 'media.loading.title.s199M1a2XDesertHerolowM271R14',
    maps: ['desert'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s39-leo2a7v-lakeside-village-herolow-cl-t3333-m271-r14.webp',
    capKey: 'media.loading.title.s39Leo2a7vLakesideVillageHerolowClT3333M271R14',
    maps: ['reservoir'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s120-type10-skybridge-herolow-v3-m271-r14.webp',
    capKey: 'media.loading.title.s120Type10SkybridgeHerolowV3M271R14',
    maps: ['skybridge'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s286-leo2a4m-monsoon-herohigh-v2-fb-m271-r14.webp',
    capKey: 'media.loading.title.s286Leo2a4mMonsoonHerohighV2FbM271R14',
    maps: ['monsoon'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s296-t90m-proryv-coastal-duel-low-tm70-f33-m271-r14.webp',
    capKey: 'media.loading.title.s296T90mProryvCoastalDuelLowTm70F33M271R14',
    maps: ['coastal'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s202-kf51-panther-copper-mesa-herohigh-m271-r14.webp',
    capKey: 'media.loading.title.s202Kf51PantherCopperMesaHerohighM271R14',
    maps: ['copper_mesa'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s267-t90a-vladimir-caldera-herohigh-fb-m271-r14.webp',
    capKey: 'media.loading.title.s267T90aVladimirCalderaHerohighFbM271R14',
    maps: ['caldera'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s289-t90ms-2011-longleaf-duel-low-tm95-m271-r14.webp',
    capKey: 'media.loading.title.s289T90ms2011LongleafDuelLowTm95M271R14',
    maps: ['longleaf'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s307-sepv2-airfield-herolow-m271-r14.webp',
    capKey: 'media.loading.title.s307Sepv2AirfieldHerolowM271R14',
    maps: ['airfield'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s47-ironworks-crane-herolow-fb-m271-r14.webp',
    capKey: 'media.loading.title.s47IronworksCraneHerolowFbM271R14',
    maps: ['foundry'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s190-t90am-frontier-herolow-own-m271-r14.webp',
    capKey: 'media.loading.title.s190T90amFrontierHerolowOwnM271R14',
    maps: ['frontier'], focal: '50% 50%',
  },
  {
    img: '/media/loading-r1/s143-ru-t72b3m-modern-mars-herolow-fb-m271-r14.webp',
    capKey: 'media.loading.title.s143RuT72b3mModernMarsHerolowFbM271R14',
    maps: ['mars'], focal: '50% 50%',
  },
]);

/** The boot splash and transition rotation: the boot pick first, then the loading stills. */
export const TRANSITION_SHOTS: readonly FeaturedShot[] = Object.freeze([
  ...FEATURED_SHOTS.filter((shot) => shot.bootImg),
  ...LOADING_SHOTS,
]);
/** Just the image URLs (boot hero + transition backdrops). */
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
