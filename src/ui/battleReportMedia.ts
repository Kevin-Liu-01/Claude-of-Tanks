import { MAP_HEROES, MAP_THUMBS, type MapThumbnailId } from './mapThumbs.ts';

/** Only shipped map identities may become image URLs; old records may lack one. */
export function battleMapArt(id: string | null | undefined, thumbnail = false): string | null {
  const catalog = thumbnail ? MAP_THUMBS : MAP_HEROES;
  return id && Object.hasOwn(catalog, id) ? catalog[id as MapThumbnailId] || null : null;
}

/**
 * The battle report's backdrop where no live scene stands behind it: the battlefield's own combat still (the media
 * lane's battle-end-r1, one 1920 x 1080 WebP per shipped map), the battlefield's hero art for an id without one.
 */
export function battleEndArt(id: string | null | undefined): string | null {
  return id && Object.hasOwn(MAP_HEROES, id) ? `/media/battle-end-r1/${id}.webp` : battleMapArt(id);
}

export function shotAccuracy(hits: number, fired: number): number {
  return Number.isFinite(hits) && Number.isFinite(fired) && fired > 0
    ? Math.round(Math.max(0, Math.min(1, hits / fired)) * 100) : 0;
}
