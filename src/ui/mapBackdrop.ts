/**
 * mapBackdrop.ts — which published map image a full-bleed loading surface requests (FE-P13).
 *
 * Every battlefield publishes 512×288 picker thumbs and 3840×2160 heroes
 * (tools/map-thumbs.mjs), and the media pipeline adds 1280×720 cards
 * (tools/media-production/publish.mjs → public/maps/cards/). The battle loading
 * screen and the battlefield transition used to fetch the 4K hero (avg 1.6 MB) on
 * every device at high priority. Their art is a darkened backdrop under a scrim
 * (src/ui/battleLoad.ts: brightness .7), so a card (avg 211 kB) carries it until a
 * screen needs more than twice the card's width in device pixels.
 */
import { MAP_HEROES, MAP_THUMBS } from './mapThumbs.ts';

/** Battlefields the media pipeline has not published a card for yet; they keep the hero. */
export const MAPS_WITHOUT_CARD: ReadonlySet<string> = new Set(['cliffbridge', 'moon', 'goreme']);

const CARD_WIDTH = 1280;
/** A card may be stretched this far before the darkened backdrop visibly softens. */
const CARD_MAX_UPSCALE = 2;
/** Pixel ratios above this add no visible detail to the darkened backdrop. */
const BACKDROP_MAX_DPR = 2;

export interface ViewportSample {
  readonly width: number;
  readonly height: number;
  readonly devicePixelRatio: number;
}

/** The 1280×720 card of a battlefield, or null when none is published. */
export function mapCardFor(mapId: string): string | null {
  return Object.hasOwn(MAP_HEROES, mapId) && !MAPS_WITHOUT_CARD.has(mapId) ? `/maps/cards/${mapId}.webp` : null;
}

/** Device pixels across a 16:9 image that covers the viewport (`background-size: cover`). */
export function backdropWidthPx(viewport: ViewportSample): number {
  const cssWidth = Math.max(viewport.width, viewport.height * 16 / 9);
  const ratio = Math.min(Math.max(Number(viewport.devicePixelRatio) || 1, 1), BACKDROP_MAX_DPR);
  return cssWidth * ratio;
}

/**
 * The full-bleed art for a battlefield: its card when that covers the viewport,
 * else the 4K hero. Without a viewport (Node, tools) the hero, as before.
 */
export function mapBackdropFor(mapId: string, viewport: ViewportSample | null): string {
  const hero = MAP_HEROES[mapId as keyof typeof MAP_HEROES] || MAP_THUMBS[mapId as keyof typeof MAP_THUMBS] || '';
  const card = mapCardFor(mapId);
  if (!card || !viewport || !(viewport.width > 0) || !(viewport.height > 0)) return hero;
  return backdropWidthPx(viewport) <= CARD_WIDTH * CARD_MAX_UPSCALE ? card : hero;
}

/** This document's viewport, or null outside a browser window. */
export function currentViewport(): ViewportSample | null {
  if (typeof window === 'undefined' || !(window.innerWidth > 0) || !(window.innerHeight > 0)) return null;
  return { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio || 1 };
}
