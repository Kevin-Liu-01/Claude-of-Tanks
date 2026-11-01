// A battlefield's localized name. It lives in the UI, not in src/world/maps/catalog.ts: the world bakes (wreck plan,
// collision, trenches) import the catalog for its maps and never name a map, and the i18n import there put the whole
// string catalog in their changed-only keys, so a string edit re-ran them on every map (267).
import { t } from './i18n.ts';
import { isMapId } from '../world/maps/mapIds.ts';

/** Localized map name. The Random option always returns the localized label. */
export function getLocalizedMapName(mapId: string): string {
  if (mapId === 'random') return t('map.random');
  return isMapId(mapId) ? t(`map.${mapId}`) : t('map.verdant');
}
