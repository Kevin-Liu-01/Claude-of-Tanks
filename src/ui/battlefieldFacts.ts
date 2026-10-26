// One battlefield's facts for the battlefield picker (interaction redesign A, owner 2026-10-26: "make map selection much
// more intituitve"): its name, its landscape, the hours it plays, the modes it hosts, whether Random draws it and its
// pictures, read from the sources that already own each datum. It imports no map config and no engine runtime, so the
// picker reads it without loading a battlefield; the placeholders (a data-URL table) load only when asked for.
//   name: catalog.ts getLocalizedMapName      regions: regionTags.ts mapRegionTags (the camo browser's landscape tags)
//   hours: battleWeatherPolicy.ts BATTLE_TIMES, Mars and the Moon held to day (battleAtmosphereRuntime.ts prepare)
//   modes: every battle mode on every map (no mode is tied to a map; gameModeCatalog.ts BATTLE_MODE_IDS)
//   random: mapIds.ts RANDOM_BATTLE_MAP_IDS   pictures: mapThumbs.ts MAP_HEROES and MAP_THUMBS, public/maps/cards
// There is no size datum: every map plays the same 1024 m square and its two sides start 720-860 m apart (Mars 513 m),
// so a size class would sort all but one map together.
import { MAP_IDS, RANDOM_BATTLE_MAP_IDS, isMapId, getLocalizedMapName, type MapId } from '../world/maps/catalog.ts';
import { BATTLE_MODE_IDS } from '../sim/gameModeCatalog.ts';
import { BATTLE_TIMES, type BattleTimeOfDay } from '../engine/battleWeatherPolicy.ts';
import { mapRegionTags } from './regionTags.ts';
import { MAP_HEROES, MAP_THUMBS } from './mapThumbs.ts';

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
  /** Its pictures: the 16:9 card (the picker's poster), the hero and the small thumb. */
  readonly poster: { readonly card: string; readonly hero: string; readonly thumb: string };
}

const DAY_ONLY: ReadonlySet<MapId> = new Set(['mars', 'moon']);
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
    poster: { card: `/maps/cards/${id}.webp`, hero: MAP_HEROES[id], thumb: MAP_THUMBS[id] },
  };
}

/** A battlefield's 48x27 blurred placeholder (a data URL) for the moment before its poster decodes; '' when it has none. */
export async function battlefieldPlaceholder(mapId: string): Promise<string> {
  const { MAP_LQIP } = await import('./mapLqip.ts');
  return isMapId(mapId) && Object.hasOwn(MAP_LQIP, mapId) ? MAP_LQIP[mapId] : '';
}
