// One battlefield's facts for the battlefield picker (interaction redesign A, owner 2026-10-26: "make map selection much
// more intituitve"): its name, its landscape, the hours it plays, the modes it hosts, whether Random draws it and its
// pictures, read from the sources that already own each datum. It imports no map config and no engine runtime, so the
// picker reads it without loading a battlefield. (The blurred placeholders, src/ui/mapLqip.ts, stay the loading screen's
// own chunk: the picker's cards show the stills themselves.)
//   name: catalog.ts getLocalizedMapName      regions: regionTags.ts mapRegionTags (the camo browser's landscape tags)
//   hours: battleWeatherPolicy.ts BATTLE_TIMES, Mars and the Moon held to day (battleAtmosphereRuntime.ts prepare)
//   modes: every battle mode on every map (no mode is tied to a map; gameModeCatalog.ts BATTLE_MODE_IDS)
//   random: mapIds.ts RANDOM_BATTLE_MAP_IDS
//   pictures: the media lane's maps-r1 stills (public/media/maps-r1/manifest.json: 16:9 at 640, 1280 and 1920 wide) where a
//     map has them, else the generated art: the 16:9 thumb and card (public/maps/thumbs, public/maps/cards) and the hero;
//     and the manifest's 6 s hover loop (960x540, muted, first frame its last) where it holds one.
//     The generated paths follow the map's id (mapThumbs.ts MAP_THUMBS and MAP_HEROES, which the selftest holds this to):
//     importing that table from the picker's lazy chunk split it off the game's boot chunk, one more boot request.
// There is no size datum: every map plays the same 1024 m square and its two sides start 720-860 m apart (Mars 513 m),
// so a size class would sort all but one map together.
import { MAP_IDS, RANDOM_BATTLE_MAP_IDS, isMapId, getLocalizedMapName, type MapId } from '../world/maps/catalog.ts';
import { BATTLE_MODE_IDS } from '../sim/gameModeCatalog.ts';
import { BATTLE_TIMES, type BattleTimeOfDay } from '../engine/battleWeatherPolicy.ts';
import { mapRegionTags } from './regionTags.ts';

type BattleModeId = typeof BATTLE_MODE_IDS[number];

interface BattlefieldFacts {
  readonly id: MapId;
  readonly name: string;
  /** Its landscape tags (woodland, desert, winter, urban, tropical, maritime, night), first the main one. */
  readonly regions: ReturnType<typeof mapRegionTags>;
  /** The hours a battle may draw here (Mars and the Moon light only by day). */
  readonly hours: readonly BattleTimeOfDay[];
  /** The battle modes it hosts. */
  readonly modes: readonly BattleModeId[];
  /** Whether Random may draw it (the space maps only by choice). */
  readonly random: boolean;
  /** Its pictures: the card's 16:9 picture (its smallest rung) with a srcset over every rung, the preview's large picture,
   *  the small thumb, and the preview's hover loop where the media lane has filmed one. */
  readonly poster: { readonly src: string; readonly srcset: string; readonly hero: string; readonly thumb: string; readonly loop?: string };
}

const DAY_ONLY: ReadonlySet<MapId> = new Set(['mars', 'moon']);
/** The maps the maps-r1 manifest holds stills and a hover loop for (all 33 since 2026-10-26); a new battlefield joins when
 *  the media lane films it, and falls back to the generated art until then (never a fetch of the manifest). */
const STILLS: ReadonlySet<MapId> = new Set<MapId>([
  'verdant', 'desert', 'winter', 'urban', 'coastal', 'autumn', 'steppe', 'railyard', 'frontier', 'fjord', 'delta',
  'badlands', 'monsoon', 'alpine', 'caldera', 'foundry', 'ruinspires', 'blackglass', 'titan_gorge', 'skybridge',
  'polders', 'copper_mesa', 'airfield', 'oasis', 'whiteout', 'orchard', 'longleaf', 'mangrove', 'saltwind',
  'reservoir', 'mars', 'moon', 'cliffbridge',
]);
const STILL_WIDTHS = [640, 1280, 1920] as const;

function poster(id: MapId): BattlefieldFacts['poster'] {
  const thumb = `/maps/thumbs/${id}.webp`;
  if (!STILLS.has(id)) {
    return { src: thumb, srcset: `${thumb} 512w, /maps/cards/${id}.webp 1280w`, hero: `/maps/${id}.webp`, thumb };
  }
  const still = (width: number): string => `/media/maps-r1/${id}-${width}.webp`;
  return {
    src: still(STILL_WIDTHS[0]), srcset: STILL_WIDTHS.map((width) => `${still(width)} ${width}w`).join(', '), hero: still(1920), thumb,
    loop: `/media/maps-r1/${id}-loop-960.mp4`,
  };
}
const RANDOM: ReadonlySet<MapId> = new Set(RANDOM_BATTLE_MAP_IDS);

/** Every battlefield's facts, in the catalog's order. */
export function battlefieldList(): readonly BattlefieldFacts[] {
  return MAP_IDS.map((id) => battlefieldFacts(id));
}

/** One battlefield's facts (an unknown id reads as Verdant Fields, as getMapConfig does). */
export function battlefieldFacts(mapId: string): BattlefieldFacts {
  const id: MapId = isMapId(mapId) ? mapId : 'verdant';
  return {
    id,
    name: getLocalizedMapName(id),
    regions: mapRegionTags(id),
    hours: DAY_ONLY.has(id) ? ['day'] : BATTLE_TIMES,
    modes: BATTLE_MODE_IDS,
    random: RANDOM.has(id),
    poster: poster(id),
  };
}
