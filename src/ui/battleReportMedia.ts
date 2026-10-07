import { MAP_HEROES, MAP_THUMBS, type MapThumbnailId } from './mapThumbs.ts';

/** Only shipped map identities may become image URLs; old records may lack one. */
export function battleMapArt(id: string | null | undefined, thumbnail = false): string | null {
  const catalog = thumbnail ? MAP_THUMBS : MAP_HEROES;
  return id && Object.hasOwn(catalog, id) ? catalog[id as MapThumbnailId] || null : null;
}

export function shotAccuracy(hits: number, fired: number): number {
  return Number.isFinite(hits) && Number.isFinite(fired) && fired > 0
    ? Math.round(Math.max(0, Math.min(1, hits / fired)) * 100) : 0;
}
